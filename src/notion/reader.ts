import { z } from 'zod';
import { NotionTools } from '../mcp/tools.js';
import type { MonitorConfig, WatchlistEntry, EscalationUpdate, Position } from '../types.js';
import type { RiskSignal } from '../risk/signals.js';
import { logger } from '../utils/logger.js';

// ─── Property extractors for Notion property objects ─────────────────────────

function propTitle(props: Record<string, unknown>, key: string): string {
  const p = props[key] as Record<string, unknown> | undefined;
  const arr = p?.['title'] as Array<Record<string, unknown>> | undefined;
  return arr?.map((t) => String(t['plain_text'] ?? '')).join('') ?? '';
}

function propRichText(props: Record<string, unknown>, key: string): string {
  const p = props[key] as Record<string, unknown> | undefined;
  const arr = p?.['rich_text'] as Array<Record<string, unknown>> | undefined;
  return arr?.map((t) => String(t['plain_text'] ?? '')).join('') ?? '';
}

function propSelect(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as Record<string, unknown> | undefined;
  const s = p?.['select'] as Record<string, unknown> | undefined;
  return typeof s?.['name'] === 'string' ? s['name'] : null;
}

function propMultiSelect(props: Record<string, unknown>, key: string): string[] {
  const p = props[key] as Record<string, unknown> | undefined;
  const arr = p?.['multi_select'] as Array<Record<string, unknown>> | undefined;
  return arr?.map((s) => String(s['name'] ?? '')).filter(Boolean) ?? [];
}

function propNumber(props: Record<string, unknown>, key: string): number | null {
  const p = props[key] as Record<string, unknown> | undefined;
  const val = p?.['number'];
  return typeof val === 'number' ? val : null;
}

function propCheckbox(props: Record<string, unknown>, key: string): boolean {
  const p = props[key] as Record<string, unknown> | undefined;
  return p?.['checkbox'] === true;
}

function propDate(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as Record<string, unknown> | undefined;
  const d = p?.['date'] as Record<string, unknown> | undefined;
  return typeof d?.['start'] === 'string' ? d['start'] : null;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function parseChain(raw: string | null): 'cardano' | 'ethereum' | null {
  const lower = raw?.toLowerCase();
  if (lower === 'cardano' || lower === 'ethereum') return lower;
  return null;
}

function parseSeverity(raw: string | null): 'low' | 'medium' | 'high' | 'critical' {
  // Strip emoji prefix: '🟢 Low' → 'low'
  const lower = raw?.replace(/^[^\w]+/, '').toLowerCase().trim() ?? '';
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  return 'low';
}

function parseRiskLevel(raw: string | null): 'safe' | 'warning' | 'danger' {
  const lower = raw?.replace(/^[^\w]+/, '').toLowerCase().trim() ?? '';
  if (lower === 'danger') return 'danger';
  if (lower === 'warning') return 'warning';
  return 'safe';
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const monitorConfigSchema = z.object({
  pageId: z.string(),
  chain: z.enum(['cardano', 'ethereum']),
  walletAddress: z.string(),
  healthThreshold: z.number(),
  tvlDropPct: z.number(),
  pollingMinutes: z.number(),
});

const watchlistEntrySchema = z.object({
  pageId: z.string(),
  protocol: z.string(),
  chain: z.enum(['cardano', 'ethereum']),
  contractAddress: z.string(),
  watchTypes: z.array(z.enum(['tvl', 'whale', 'health', 'yield'])),
});

// ─── NotionReader ─────────────────────────────────────────────────────────────

export class NotionReader {
  constructor(
    private readonly tools: NotionTools,
    private readonly dbIds: {
      config: string;
      watchlist: string;
      riskDashboard: string;
      positions: string;
    },
  ) {}

  async readConfig(): Promise<MonitorConfig[]> {
    const rows = await this.tools.queryDatabaseView(this.dbIds.config, {
      property: 'active',
      checkbox: { equals: true },
    });

    const configs: MonitorConfig[] = [];
    for (const row of rows) {
      const chainRaw = propSelect(row.properties, 'chain')?.toLowerCase();
      const raw = {
        pageId: row.id,
        chain: chainRaw,
        walletAddress: propRichText(row.properties, 'wallet_address'),
        healthThreshold: propNumber(row.properties, 'health_factor_threshold') ?? 1.2,
        tvlDropPct: propNumber(row.properties, 'tvl_drop_pct') ?? 15,
        pollingMinutes: propNumber(row.properties, 'polling_minutes') ?? 5,
      };

      const result = monitorConfigSchema.safeParse(raw);
      if (result.success) {
        configs.push(result.data);
      } else {
        logger.warn(`[Reader] Skipping invalid config row ${row.id}: ${result.error.message}`);
      }
    }

    logger.info(`[Reader] Loaded ${configs.length} active monitoring configs`);
    return configs;
  }

  async readWatchlist(): Promise<WatchlistEntry[]> {
    const rows = await this.tools.queryDatabaseView(this.dbIds.watchlist, {
      property: 'active',
      checkbox: { equals: true },
    });

    const entries: WatchlistEntry[] = [];
    for (const row of rows) {
      const chainRaw = propSelect(row.properties, 'chain')?.toLowerCase();
      const watchTypesRaw = propMultiSelect(row.properties, 'watch_type').map((t) =>
        t.toLowerCase(),
      );

      const raw = {
        pageId: row.id,
        protocol: propTitle(row.properties, 'protocol'),
        chain: chainRaw,
        contractAddress: propRichText(row.properties, 'contract_address'),
        watchTypes: watchTypesRaw,
      };

      const result = watchlistEntrySchema.safeParse(raw);
      if (result.success) {
        entries.push(result.data);
      } else {
        logger.warn(`[Reader] Skipping invalid watchlist row ${row.id}: ${result.error.message}`);
      }
    }

    return entries;
  }

  async readPositions(): Promise<Position[]> {
    const rows = await this.tools.queryDatabaseView(this.dbIds.positions);

    const positions: Position[] = [];
    for (const row of rows) {
      const chain = parseChain(propSelect(row.properties, 'chain'));
      if (!chain) continue;

      positions.push({
        id: row.id,
        name: propTitle(row.properties, 'position'),
        chain,
        protocol: propRichText(row.properties, 'protocol'),
        wallet: propRichText(row.properties, 'wallet'),
        valueUsd: propNumber(row.properties, 'value_usd') ?? 0,
        healthFactor: propNumber(row.properties, 'health_factor') ?? 0,
        riskLevel: parseRiskLevel(propSelect(row.properties, 'risk_level')),
        lastUpdated: propDate(row.properties, 'last_updated') ?? new Date().toISOString(),
      });
    }

    logger.info(`[Reader] Loaded ${positions.length} positions`);
    return positions;
  }

  async readTodayRiskEvents(): Promise<RiskSignal[]> {
    const rows = await this.tools.queryDatabaseView(this.dbIds.riskDashboard);

    const today = new Date().toISOString().split('T')[0]!;
    const signals: RiskSignal[] = [];

    for (const row of rows) {
      const detectedAt = propDate(row.properties, 'detected_at');
      // Filter to today's events in code
      if (detectedAt && !detectedAt.startsWith(today)) continue;

      const chain = parseChain(propSelect(row.properties, 'chain'));
      if (!chain) continue;

      signals.push({
        id: row.id,
        type: 'anomaly',
        severity: parseSeverity(propSelect(row.properties, 'severity')),
        chain,
        protocol: propRichText(row.properties, 'protocol'),
        event: propTitle(row.properties, 'event'),
        details: propRichText(row.properties, 'ai_analysis'),
        aiAnalysis: propRichText(row.properties, 'ai_analysis') || undefined,
        recommendedAction: propRichText(row.properties, 'recommended_action') || undefined,
        detectedAt: detectedAt ?? new Date().toISOString(),
      });
    }

    logger.info(`[Reader] Loaded ${signals.length} risk events for today`);
    return signals;
  }

  async pollEscalations(): Promise<EscalationUpdate[]> {
    const rows = await this.tools.queryDatabaseView(this.dbIds.riskDashboard, {
      property: 'status',
      select: { equals: 'Approved' },
    });

    const updates: EscalationUpdate[] = [];
    for (const row of rows) {
      const update: EscalationUpdate = {
        pageId: row.id,
        event: propTitle(row.properties, 'event'),
        chain: propSelect(row.properties, 'chain') ?? '',
        protocol: propRichText(row.properties, 'protocol'),
        recommendedAction: propRichText(row.properties, 'recommended_action'),
      };
      updates.push(update);

      // Auto-resolve via MCP
      await this.tools.updatePage(row.id, {
        status: { select: { name: 'Resolved' } },
      });

      // Leave an agent comment acknowledging resolution (showcases notion-create-comment)
      await this.tools.addComment(
        row.id,
        `✅ VaultRoom Agent: Escalation resolved at ${new Date().toISOString()}. Action taken: ${update.recommendedAction || 'manual review completed'}.`,
      );

      logger.info(`[MCP] Escalation resolved: ${update.event}`);
    }

    return updates;
  }
}
