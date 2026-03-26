import { NotionTools } from '../mcp/tools.js';
import type { RiskSignal } from '../risk/signals.js';
import type { Position, AlertEntry } from '../types.js';
import { logger } from '../utils/logger.js';

/**
 * NotionWriter — writes to Notion databases via hosted MCP.
 * 
 * Uses flat SQL-style property values (not nested Notion API format):
 * - Text/Title: plain string
 * - Select: option name string
 * - Number: number value
 * - Date: expanded `"date:Field:start"` key
 * - Checkbox: `"__YES__"` / `"__NO__"`
 * - Multi-select: JSON array string `'["a","b"]'`
 */

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
        "Event": signal.event,
        "Chain": capitalize(signal.chain),
        "Protocol": signal.protocol,
        "Severity": SEVERITY_LABELS[signal.severity] ?? signal.severity,
        "date:Detected At:start": signal.detectedAt,
        "AI Analysis": (signal.aiAnalysis ?? '').slice(0, 2000),
        "Recommended Action": (signal.recommendedAction ?? '').slice(0, 2000),
        "Status": status,
      },
      content,
    }]);

    const id = pageId ?? '';
    logger.info(`[MCP] Risk event written: ${signal.event} [${signal.severity}]`);
    return id;
  }

  async writePosition(position: Position): Promise<string> {
    // Upsert: search for existing position by title
    const searchQuery = `${position.protocol} ${position.chain}`;
    const existing = await this.tools.search(searchQuery);
    const existingPage = existing.find(
      (r) =>
        r.type === 'page' &&
        r.title.toLowerCase().includes(position.protocol.toLowerCase()),
    );

    const properties: Record<string, unknown> = {
      "Position": position.name,
      "Chain": capitalize(position.chain),
      "Protocol": position.protocol,
      "Wallet": position.wallet,
      "Value USD": position.valueUsd,
      "Health Factor": position.healthFactor,
      "Risk Level": RISK_LEVEL_LABELS[position.riskLevel] ?? position.riskLevel,
      "date:Last Updated:start": position.lastUpdated,
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
        "Alert": alert.title,
        "Chain": capitalize(alert.chain),
        "Severity": capitalize(alert.severity),
        "date:Timestamp:start": new Date().toISOString(),
        "Details": alert.details.slice(0, 2000),
      },
    }]);

    return pageId ?? '';
  }
}
