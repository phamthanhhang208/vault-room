# VaultRoom — Phase 1: Notion Read/Write Layer (via MCP)

> **Time estimate:** ~1.5 days
> **Priority:** HIGH — judges scrutinize MCP integration depth
> **Depends on:** Phase 0 (scaffold + MCP client connecting to remote Notion MCP)

## Goal

Build the full typed Notion read/write layer using MCP tool calls to the
remote hosted Notion MCP server (`https://mcp.notion.com/mcp`). After this
phase, the agent can read human-configured settings from Notion and write
structured risk data back — all through MCP, not the REST API.

**CRITICAL:** All Notion interactions go through MCP tools. We never import
`@notionhq/client`. The MCP tools we use:

| MCP Tool | Purpose in VaultRoom |
|----------|---------------------|
| `notion-search` | Find databases by name |
| `notion-fetch` | Read a page/database by URL or ID |
| `notion-create-database` | Setup script (Phase 0) |
| `notion-create-pages` | Write risk events, positions, alerts |
| `notion-update-page` | Update position data, resolve escalations |
| `notion-query-database-view` | Query Config, Watchlist, Risk Dashboard |
| `notion-create-comment` | Add comments to escalated items |

## Notion-flavored Markdown

The remote MCP server uses Notion-flavored Markdown for page content,
NOT the JSON block array format from the REST API. This is important —
it's more token-efficient and what Notion designed for AI agents.

Example of creating a page with rich content:
```typescript
await mcpClient.callTool('notion-create-pages', {
  pages: [{
    parent: { database_id: 'abc123' },
    properties: {
      'Name': { title: [{ text: { content: 'My Page' } }] },
      'Status': { select: { name: 'New' } },
    },
    // Content as Notion-flavored Markdown
    content: `
## Portfolio Overview

> ⚠️ **CRITICAL:** 1 position requires immediate attention

| Protocol | Chain | Value | Health | Risk |
|----------|-------|-------|--------|------|
| Aave V3 | Ethereum | $1.2M | 1.42 | 🟢 Safe |
| GMX | Arbitrum | $450K | 1.15 | 🟡 Warning |

---

## Recommendations

1. Inject additional USDC collateral into Aerodrome position
2. Monitor GMX WBTC position closely — approaching threshold

<details>
<summary>🔍 Detailed Analysis</summary>

The full Gemini analysis goes here. This renders as a toggle in Notion.

</details>
`
  }]
});
```

## MCP Client Wrapper (src/mcp/tools.ts)

Build typed helper functions that wrap raw MCP tool calls. Each function
handles the MCP call, parses the response, and returns typed data.

```typescript
// This file wraps raw MCP tool calls into typed, reusable functions.
// It depends on your MCP client from Phase 0 (src/mcp/client.ts).

import { McpClient } from './client'; // your Phase 0 MCP client

export class NotionTools {
  constructor(private mcp: McpClient) {}

  // ─── SEARCH & FETCH ───

  async search(query: string): Promise<NotionSearchResult[]>;
  async fetchPage(pageIdOrUrl: string): Promise<NotionPage>;
  async fetchDatabase(dbIdOrUrl: string): Promise<NotionDatabase>;

  // ─── QUERY ───

  async queryDatabaseView(
    databaseId: string,
    filter?: Record<string, unknown>,
  ): Promise<NotionQueryResult>;

  // ─── CREATE ───

  async createPages(
    pages: CreatePageInput[]
  ): Promise<string[]>; // returns page IDs

  // ─── UPDATE ───

  async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
    content?: string, // Notion-flavored Markdown to append/replace
  ): Promise<void>;

  // ─── COMMENTS ───

  async addComment(pageId: string, text: string): Promise<void>;
}

interface CreatePageInput {
  parentDatabaseId: string;
  properties: Record<string, unknown>;
  content?: string; // Notion-flavored Markdown
}
```

### Implementation notes:

Each method calls `this.mcp.callTool(toolName, args)` and parses the result.
MCP tool responses come back as text content — parse accordingly.

```typescript
async search(query: string): Promise<NotionSearchResult[]> {
  const result = await this.mcp.callTool('notion-search', { query });
  // result.content is an array of content blocks
  // Parse the text content to extract page/database references
  return parseSearchResults(result);
}

async createPages(pages: CreatePageInput[]): Promise<string[]> {
  const result = await this.mcp.callTool('notion-create-pages', {
    pages: pages.map(p => ({
      parent: { database_id: p.parentDatabaseId },
      properties: p.properties,
      content: p.content,
    })),
  });
  return parseCreatedPageIds(result);
}
```

## src/notion/reader.ts — Reads human config from Notion

**IMPORTANT:** These functions query Notion databases via MCP to read what
human operators have configured. The agent reads these every cycle.

### readConfig(): Promise<MonitorConfig[]>

1. Call `notion-fetch` with the Config database ID to get its structure
2. Call `notion-query-database-view` to get all entries where active = true
   - If no view is set up, use `notion-fetch` on the database URL and parse results
3. Parse each row into typed MonitorConfig
4. Log: "Loaded {N} active monitoring configs"

```typescript
interface MonitorConfig {
  pageId: string;
  chain: 'cardano' | 'ethereum';
  walletAddress: string;
  healthThreshold: number;
  tvlDropPct: number;
  pollingMinutes: number;
}
```

### readWatchlist(): Promise<WatchlistEntry[]>

- Same pattern: query Watchlist DB, filter active = true
- Parse into typed WatchlistEntry

```typescript
interface WatchlistEntry {
  pageId: string;
  protocol: string;
  chain: 'cardano' | 'ethereum';
  contractAddress: string;
  watchTypes: ('tvl' | 'whale' | 'health' | 'yield')[];
}
```

### pollEscalations(): Promise<EscalationUpdate[]>

- Query Risk Dashboard DB for entries where status = "Approved"
- These are items a human just approved in Notion
- For each found: call `notion-update-page` to set status → "Resolved"
- Return the list for logging

```typescript
interface EscalationUpdate {
  pageId: string;
  event: string;
  chain: string;
  protocol: string;
  recommendedAction: string;
}
```

### Parsing MCP responses

The MCP tool responses return content as text (often Markdown-formatted).
You need to parse this to extract structured data. The approach:

```typescript
// notion-fetch returns page content as Notion-flavored Markdown + properties
// notion-query-database-view returns rows with property values

function parseQueryResults(mcpResponse: ToolResult): DatabaseRow[] {
  // The response text contains structured data about each row
  // Parse property values from the response format
  // Use zod to validate parsed data
}
```

**Tip:** Call `notion-fetch` on your Config database first to understand the
exact response format. Log the raw response. Then build your parser to match.

## src/notion/writer.ts — Agent writes risk data to Notion

### writeRiskEvent(signal: RiskSignal): Promise<string>

Create a page in Risk Dashboard DB via `notion-create-pages`:

```typescript
async writeRiskEvent(signal: RiskSignal): Promise<string> {
  const severityMap = {
    low: '🟢 Low',
    medium: '🟡 Medium',
    high: '🟠 High',
    critical: '🔴 Critical',
  };

  const [pageId] = await this.tools.createPages([{
    parentDatabaseId: this.config.NOTION_RISK_DASHBOARD_DB_ID,
    properties: {
      'event': { title: [{ text: { content: signal.message } }] },
      'chain': { select: { name: capitalize(signal.chain) } },
      'protocol': { rich_text: [{ text: { content: signal.protocol } }] },
      'severity': { select: { name: severityMap[signal.severity] } },
      'detected_at': { date: { start: signal.detectedAt.toISOString() } },
      'ai_analysis': { rich_text: [{ text: { content: signal.aiAnalysis || '' } }] },
      'recommended_action': { rich_text: [{ text: { content: signal.recommendedAction || '' } }] },
      'status': { select: { name: signal.severity === 'critical' ? 'Escalated' : 'New' } },
    },
    // Rich content body with AI analysis
    content: signal.aiAnalysis ? `
## Risk Analysis

${signal.aiAnalysis}

---

**Recommended Action:** ${signal.recommendedAction}
` : undefined,
  }]);

  logger.info(`Risk event written: ${signal.message} [${signal.severity}]`);
  return pageId;
}
```

### writePosition(position: Position): Promise<string>

Upsert logic:
1. Use `notion-search` to find existing position page by wallet + protocol + chain
2. If found → `notion-update-page` with new values
3. If not found → `notion-create-pages` with all fields

```typescript
async writePosition(position: Position): Promise<string> {
  // Search for existing position
  const existing = await this.findExistingPosition(position);

  const riskMap = {
    safe: '🟢 Safe',
    warning: '🟡 Warning',
    danger: '🔴 Danger',
  };

  const properties = {
    'position': { title: [{ text: { content: position.name } }] },
    'chain': { select: { name: capitalize(position.chain) } },
    'protocol': { rich_text: [{ text: { content: position.protocol } }] },
    'wallet': { rich_text: [{ text: { content: position.wallet } }] },
    'value_usd': { number: position.valueUsd },
    'health_factor': { number: position.healthFactor },
    'risk_level': { select: { name: riskMap[position.riskLevel] } },
    'last_updated': { date: { start: new Date().toISOString() } },
  };

  if (existing) {
    await this.tools.updatePage(existing.pageId, properties);
    return existing.pageId;
  } else {
    const [pageId] = await this.tools.createPages([{
      parentDatabaseId: this.config.NOTION_POSITIONS_DB_ID,
      properties,
    }]);
    return pageId;
  }
}
```

### writeAlert(alert: AlertEntry): Promise<string>

Append-only — always create a new page in Alert Log DB:

```typescript
async writeAlert(alert: AlertEntry): Promise<string> {
  const [pageId] = await this.tools.createPages([{
    parentDatabaseId: this.config.NOTION_ALERT_LOG_DB_ID,
    properties: {
      'alert': { title: [{ text: { content: alert.title } }] },
      'chain': { select: { name: capitalize(alert.chain) } },
      'severity': { select: { name: capitalize(alert.severity) } },
      'timestamp': { date: { start: new Date().toISOString() } },
      'details': { rich_text: [{ text: { content: alert.details } }] },
    },
  }]);
  return pageId;
}
```

## src/notion/digest.ts — THE SHOWCASE

### writeDigest(data: DigestData): Promise<string>

This is the crown jewel — a rich Notion page built entirely through MCP
using Notion-flavored Markdown. The MCP server handles converting Markdown
to Notion blocks automatically.

```typescript
async writeDigest(data: DigestData): Promise<string> {
  const positionRows = data.positions.map(p =>
    `| ${p.protocol} | ${p.chain} | $${p.valueUsd.toLocaleString()} | ${p.healthFactor.toFixed(2)} | ${riskEmoji(p.riskLevel)} |`
  ).join('\n');

  const riskEventsList = data.riskEvents.map(e =>
    `- ${severityEmoji(e.severity)} **[${e.chain}]** ${e.message}`
  ).join('\n');

  const recommendationsList = data.recommendations.map((r, i) =>
    `${i + 1}. ${r}`
  ).join('\n');

  const criticalCallout = data.activeAlerts > 0
    ? `> ⚠️ **CRITICAL:** ${data.activeAlerts} position(s) require immediate attention\n\n`
    : '';

  const content = `
> 📊 **Portfolio Snapshot** — Total: $${data.totalExposure.toLocaleString()} | Health: ${data.avgHealth.toFixed(2)} | Alerts: ${data.activeAlerts}

---

## Portfolio Overview

${criticalCallout}| Protocol | Chain | Value (USD) | Health Factor | Risk |
|----------|-------|-------------|---------------|------|
${positionRows}

---

## Risk Events

${riskEventsList || '_No risk events detected today._'}

---

## Recommendations

${recommendationsList || '_No action items today._'}

---

<details>
<summary>🔍 Detailed Analysis</summary>

${data.fullAnalysis}

</details>
`;

  const [pageId] = await this.tools.createPages([{
    parentDatabaseId: this.config.NOTION_DIGESTS_PAGE_ID, // or parent page
    properties: {
      'title': { title: [{ text: { content: `📊 Daily Digest — ${data.date}` } }] },
    },
    content,
  }]);

  logger.info(`Digest published: ${data.date}`);
  return pageId;
}
```

**Key advantage of MCP:** We write Markdown and the Notion MCP server
converts it to proper Notion blocks. No need to manually construct
callout blocks, toggle blocks, table blocks in JSON. The `<details>` tag
becomes a Notion toggle. The `>` blockquote becomes a callout. Tables
become Notion tables. This is way cleaner than the REST API.

## MCP Rate Limits to Watch

The remote Notion MCP server has:
- **180 requests/minute** general limit (3/sec)
- **30 searches/minute** for `notion-search`

Our agent should:
- Batch page creates where possible (notion-create-pages accepts arrays)
- Cache config/watchlist reads per cycle (don't re-read mid-cycle)
- Use sequential calls, not parallel, to stay under limits
- Add a small delay (200ms) between consecutive MCP calls

```typescript
// In mcp/tools.ts — add rate limiting
private async rateLimitedCall(tool: string, args: any): Promise<any> {
  await this.waitForRateLimit();
  return this.mcp.callTool(tool, args);
}

private lastCallTime = 0;
private async waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - this.lastCallTime;
  if (elapsed < 200) {
    await sleep(200 - elapsed);
  }
  this.lastCallTime = Date.now();
}
```

## Testing checklist

1. **MCP connection test:**
   - Verify MCP client connects to remote Notion MCP server
   - Call `notion-search` with a test query → confirm results come back
   - Log raw MCP response format to understand structure

2. **Reader test:**
   - Add 2 config entries in Notion manually (one Cardano, one Ethereum wallet)
   - Run readConfig() → confirm typed output matches
   - Run readWatchlist() → confirm typed output
   - Check: active filtering works, empty DB returns []

3. **Writer test:**
   - Run writeRiskEvent with a mock critical signal
   - Open Notion → confirm page exists with correct properties + content
   - Run writePosition twice with same wallet → confirm upsert (not duplicate)
   - Run writeAlert → confirm new entry in Alert Log

4. **Digest test:**
   - Run writeDigest with mock DigestData
   - Open in Notion → verify:
     - Callout renders (from `>` blockquote)
     - Table renders with correct columns
     - Toggle expands (from `<details>` tag)
     - Recommendations as numbered list

5. **Escalation test:**
   - Create a Risk Dashboard entry with status "Escalated" (via writer)
   - Manually change status to "Approved" in Notion UI
   - Run pollEscalations() → confirm it detects the approval
   - Check: status auto-updated to "Resolved" via notion-update-page

6. **Rate limit test:**
   - Run 10 rapid MCP calls → confirm no 429 errors
   - Check logs show rate limiting delays

## Acceptance criteria

- [ ] All Notion interactions go through MCP tool calls (zero @notionhq/client imports)
- [ ] Reader functions return properly typed data from MCP responses
- [ ] Writer creates correctly formatted Notion pages via MCP
- [ ] Page content uses Notion-flavored Markdown (not JSON blocks)
- [ ] Position upsert works (no duplicates on re-run)
- [ ] Digest page renders with callouts, tables, toggles in Notion
- [ ] Escalation poll-and-resolve cycle works end-to-end via MCP
- [ ] Rate limiting prevents 429 errors
- [ ] Zero TypeScript errors (`pnpm run typecheck`)
