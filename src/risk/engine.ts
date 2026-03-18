import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import type { RiskSignal, Severity } from './signals.js';
import type { Position, MonitorConfig } from '../types.js';
import type { WalletSnapshot } from '../chains/types.js';
import { analyzeRiskSignalPrompt, dailyDigestPrompt } from './prompts.js';
import { logger } from '../utils/logger.js';

const aiAnalysisSchema = z.object({
  summary: z.string(),
  action: z.string(),
  adjustedSeverity: z.enum(['low', 'medium', 'high', 'critical']),
});

const aiDigestSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
  fullAnalysis: z.string(),
});

export interface DigestInput {
  totalExposure: number;
  avgHealth: number;
  activeAlerts: number;
  positions: Position[];
  riskEvents: RiskSignal[];
}

export interface DigestAnalysis {
  briefing: string;
  recommendations: string[];
}

export class RiskEngine {
  private readonly gemini: ReturnType<InstanceType<typeof GoogleGenerativeAI>['getGenerativeModel']>;
  private readonly previousBalances = new Map<string, number>(); // wallet → last known native balance

  constructor(geminiApiKey: string) {
    const ai = new GoogleGenerativeAI(geminiApiKey);
    this.gemini = ai.getGenerativeModel({ model: 'gemini-2.5-pro' });
  }

  async detectSignals(
    snapshot: WalletSnapshot,
    positions: Position[],
    config: MonitorConfig,
  ): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    // 1. Health factor checks on Notion-tracked positions
    for (const position of positions) {
      const severity = this.healthFactorSeverity(position.healthFactor, config.healthThreshold);
      if (severity) {
        signals.push(
          this.makeSignal({
            type: 'health_factor',
            severity,
            chain: position.chain,
            protocol: position.protocol,
            wallet: position.wallet,
            event: `${position.protocol} health factor at ${position.healthFactor.toFixed(2)}`,
            details: `Health factor ${position.healthFactor.toFixed(2)} is ${
              severity === 'critical'
                ? 'below 1.0 — liquidation imminent'
                : `below threshold ${config.healthThreshold}`
            }`,
          }),
        );
      }
    }

    // 2. Whale movement detection from on-chain transactions
    const nativeBalance = snapshot.balances.find(
      (b) => b.symbol === 'ADA' || b.symbol === 'ETH',
    );
    const totalBalance = nativeBalance?.amount ?? 0;

    for (const tx of snapshot.recentTxs) {
      if (totalBalance > 0 && tx.amount > totalBalance * 0.1) {
        const pct = ((tx.amount / totalBalance) * 100).toFixed(1);
        signals.push(
          this.makeSignal({
            type: 'whale_movement',
            severity: 'high',
            chain: snapshot.chain,
            protocol: 'wallet',
            wallet: snapshot.address,
            event: `Large ${tx.type === 'in' ? 'inbound' : 'outbound'} tx: ${tx.amount.toFixed(2)} ${tx.token}`,
            details: `${pct}% of wallet balance moved in single transaction (${tx.hash.slice(0, 12)}...)`,
          }),
        );
      }
    }

    // 3. Balance change anomaly vs previous cycle
    const balanceSignal = this.checkBalanceChange(
      snapshot.address,
      totalBalance,
      snapshot.chain,
    );
    if (balanceSignal) signals.push(balanceSignal);
    this.previousBalances.set(snapshot.address, totalBalance);

    // 4. AI enrichment for high/critical signals
    const enriched: RiskSignal[] = [];
    for (const signal of signals) {
      if (signal.severity === 'high' || signal.severity === 'critical') {
        enriched.push(await this.enrichWithAI(signal));
      } else {
        enriched.push(signal);
      }
    }

    logger.info(
      `[RiskEngine] ${enriched.length} signal(s) detected for ${snapshot.address.slice(0, 12)}...`,
    );
    return enriched;
  }

  healthFactorSeverity(healthFactor: number, threshold: number): Severity | null {
    if (healthFactor < 1.0) return 'critical';
    if (healthFactor < 1.1) return 'high';
    if (healthFactor < threshold) return 'medium';
    return null;
  }

  private checkBalanceChange(
    wallet: string,
    currentBalance: number,
    chain: 'cardano' | 'ethereum',
  ): RiskSignal | null {
    const prev = this.previousBalances.get(wallet);
    if (prev === undefined || prev === 0 || currentBalance === 0) return null;

    const changePct = ((currentBalance - prev) / prev) * 100;
    if (changePct >= -20) return null;

    const severity: Severity = changePct < -50 ? 'critical' : 'high';
    return this.makeSignal({
      type: 'balance_drop',
      severity,
      chain,
      protocol: 'wallet',
      wallet,
      event: `Balance dropped ${Math.abs(changePct).toFixed(1)}% since last check`,
      details: `Previous: ${prev.toFixed(4)}, Current: ${currentBalance.toFixed(4)} — ${Math.abs(changePct).toFixed(1)}% decrease`,
    });
  }

  async enrichWithAI(signal: RiskSignal): Promise<RiskSignal> {
    try {
      const prompt = analyzeRiskSignalPrompt(signal);
      const result = await this.gemini.generateContent(prompt);
      const text = result.response.text();
      const clean = text.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = aiAnalysisSchema.parse(JSON.parse(clean));
      logger.info(`[RiskEngine] AI enriched signal ${signal.id} → severity: ${parsed.adjustedSeverity}`);
      return {
        ...signal,
        severity: parsed.adjustedSeverity,
        aiAnalysis: parsed.summary,
        recommendedAction: parsed.action,
      };
    } catch (err) {
      logger.warn(
        `[RiskEngine] AI enrichment failed for ${signal.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return signal;
    }
  }

  async generateDigestAnalysis(data: DigestInput): Promise<DigestAnalysis> {
    const date = new Date().toISOString().split('T')[0] ?? new Date().toDateString();
    const prompt = dailyDigestPrompt(data.positions, data.riskEvents, date);
    try {
      const result = await this.gemini.generateContent(prompt);
      const text = result.response.text();
      const clean = text.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = aiDigestSchema.parse(JSON.parse(clean));
      return {
        briefing: `${parsed.summary}\n\n${parsed.fullAnalysis}`,
        recommendations: parsed.recommendations,
      };
    } catch (err) {
      logger.warn(
        `[RiskEngine] Digest AI generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        briefing: `Portfolio snapshot: $${data.totalExposure.toLocaleString()} total exposure, avg health factor ${data.avgHealth.toFixed(2)}.`,
        recommendations: ['Review positions manually — AI analysis unavailable.'],
      };
    }
  }

  makeSignal(overrides: Omit<RiskSignal, 'id' | 'detectedAt'>): RiskSignal {
    return {
      ...overrides,
      id: uuidv4(),
      detectedAt: new Date().toISOString(),
    };
  }
}
