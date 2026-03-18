import { NotionTools } from '../mcp/tools.js';
import type { DigestData, Position } from '../types.js';
import type { RiskSignal } from '../risk/signals.js';
import { logger } from '../utils/logger.js';

const SEVERITY_EMOJI: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

const RISK_EMOJI: Record<string, string> = {
  safe: '🟢',
  warning: '🟡',
  danger: '🔴',
};

function formatPositionRow(p: Position): string {
  const emoji = RISK_EMOJI[p.riskLevel] ?? '⚪';
  return `| ${p.protocol} | ${p.chain} | $${p.valueUsd.toLocaleString()} | ${p.healthFactor.toFixed(2)} | ${emoji} ${p.riskLevel} |`;
}

function formatRiskEvent(e: RiskSignal): string {
  const emoji = SEVERITY_EMOJI[e.severity] ?? '⚪';
  return `- ${emoji} **[${e.chain}]** ${e.event}`;
}

/**
 * Builds rich Notion digest pages using Notion-flavored Markdown.
 * The remote MCP server converts Markdown → Notion blocks automatically:
 *   > blockquote      → callout block
 *   <details>         → toggle block
 *   | table |         → table block
 *   ## heading        → heading_2
 *   1. numbered list  → numbered_list_item
 *   - bullet          → bulleted_list_item
 */
export class DigestBuilder {
  constructor(
    private readonly tools: NotionTools,
    private readonly digestsPageId: string,
  ) {}

  async writeDigest(data: DigestData): Promise<string> {
    const title = `📊 Daily Digest — ${data.date}`;
    const criticalCount = data.riskEvents.filter((e) => e.severity === 'critical').length;

    const positionRows = data.positions.map(formatPositionRow).join('\n');
    const riskEventLines = data.riskEvents.map(formatRiskEvent).join('\n');
    const recommendationLines = data.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');

    const criticalCallout = criticalCount > 0
      ? `> ⚠️ **CRITICAL:** ${criticalCount} position(s) require immediate attention\n\n`
      : '';

    const content = `> 📊 **Portfolio Snapshot** — Total: $${data.totalExposure.toLocaleString()} | Avg Health: ${data.avgHealth.toFixed(2)} | Active Alerts: ${data.activeAlerts}

---

## Portfolio Overview

${criticalCallout}| Protocol | Chain | Value (USD) | Health Factor | Risk |
|----------|-------|-------------|---------------|------|
${positionRows || '| — | — | — | — | — |'}

---

## Risk Events

${riskEventLines || '_No risk events detected today._'}

---

## Recommendations

${recommendationLines || '_No action items today._'}

---

<details>
<summary>🔍 Detailed Analysis</summary>

${data.fullAnalysis || '_No detailed analysis available._'}

</details>
`;

    const pageId = await this.tools.createPage(this.digestsPageId, title, content);
    const pageUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;
    logger.info(`[MCP] Digest published: ${title} — ${pageUrl}`);
    return pageUrl;
  }
}
