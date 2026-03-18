import { NotionTools } from '../mcp/tools.js';
import type { RiskSignal } from '../risk/signals.js';
import type { Position, AlertEntry } from '../types.js';
import { logger } from '../utils/logger.js';

const SEVERITY_LABELS: Record<string, string> = {
  low: '🟢 Low',
  medium: '🟡 Medium',
  high: '🟠 High',
  critical: '🔴 Critical',
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  safe: '🟢 Safe',
  warning: '🟡 Warning',
  danger: '🔴 Danger',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class NotionWriter {
  constructor(
    private readonly tools: NotionTools,
    private readonly dbIds: {
      riskDashboard: string;
      positions: string;
      alertLog: string;
    },
  ) {}

  async writeRiskEvent(signal: RiskSignal): Promise<string> {
    const status = signal.severity === 'critical' ? 'Escalated' : 'New';

    const content = signal.aiAnalysis
      ? `## Risk Analysis\n\n${signal.aiAnalysis}\n\n---\n\n**Recommended Action:** ${signal.recommendedAction ?? 'Monitor closely'}\n`
      : undefined;

    const [pageId] = await this.tools.createPages([{
      parentDatabaseId: this.dbIds.riskDashboard,
      properties: {
        event: { title: [{ text: { content: signal.event } }] },
        chain: { select: { name: capitalize(signal.chain) } },
        protocol: { rich_text: [{ text: { content: signal.protocol } }] },
        severity: { select: { name: SEVERITY_LABELS[signal.severity] ?? signal.severity } },
        detected_at: { date: { start: signal.detectedAt } },
        ai_analysis: { rich_text: [{ text: { content: (signal.aiAnalysis ?? '').slice(0, 2000) } }] },
        recommended_action: { rich_text: [{ text: { content: (signal.recommendedAction ?? '').slice(0, 2000) } }] },
        status: { select: { name: status } },
      },
      content,
    }]);

    const id = pageId ?? '';
    logger.info(`[MCP] Risk event written: ${signal.event} [${signal.severity}]`);
    return id;
  }

  async writePosition(position: Position): Promise<string> {
    // Upsert: search for existing position by title (wallet+protocol+chain combo)
    const searchQuery = `${position.protocol} ${position.wallet} ${position.chain}`;
    const existing = await this.tools.search(searchQuery);
    const existingPage = existing.find(
      (r) =>
        r.type === 'page' &&
        r.title.toLowerCase().includes(position.protocol.toLowerCase()),
    );

    const properties = {
      position: { title: [{ text: { content: position.name } }] },
      chain: { select: { name: capitalize(position.chain) } },
      protocol: { rich_text: [{ text: { content: position.protocol } }] },
      wallet: { rich_text: [{ text: { content: position.wallet } }] },
      value_usd: { number: position.valueUsd },
      health_factor: { number: position.healthFactor },
      risk_level: { select: { name: RISK_LEVEL_LABELS[position.riskLevel] ?? position.riskLevel } },
      last_updated: { date: { start: position.lastUpdated } },
    };

    let pageId: string;
    if (existingPage) {
      await this.tools.updatePage(existingPage.id, properties);
      pageId = existingPage.id;
    } else {
      const [created] = await this.tools.createPages([{
        parentDatabaseId: this.dbIds.positions,
        properties,
      }]);
      pageId = created ?? '';
    }

    logger.info(`[MCP] Position updated: ${position.name} — health ${position.healthFactor}`);
    return pageId;
  }

  async writeAlert(alert: AlertEntry): Promise<string> {
    const [pageId] = await this.tools.createPages([{
      parentDatabaseId: this.dbIds.alertLog,
      properties: {
        alert: { title: [{ text: { content: alert.title } }] },
        chain: { select: { name: capitalize(alert.chain) } },
        severity: { select: { name: capitalize(alert.severity) } },
        timestamp: { date: { start: new Date().toISOString() } },
        details: { rich_text: [{ text: { content: alert.details.slice(0, 2000) } }] },
      },
    }]);

    return pageId ?? '';
  }
}
