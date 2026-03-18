# VaultRoom — Phase 4: Demo Script + README

> **Time estimate:** ~1 day
> **Priority:** CRITICAL — this is what judges actually evaluate
> **Depends on:** Phases 0-3 all working

## Goal

Build a scripted demo that showcases the full VaultRoom flow in ~2 minutes,
plus a polished README that sells the project. The demo is the submission.

**Demo must clearly show MCP in action** — every Notion interaction should be
visible in terminal logs as MCP tool calls. Judges need to see that this is
a real MCP integration, not a REST API wrapper.

## scripts/demo.ts — Automated demo scenario

### MCP visibility in demo output

Every MCP tool call should log what it's doing:
```
  [MCP] notion-create-pages → Risk Dashboard: "Aerodrome health critical"
  [MCP] notion-update-page → Position: Aave V3 health 1.42 ✓
  [MCP] notion-search → Polling escalations...
  [MCP] notion-create-comment → Agent acknowledged resolution
```

This proves to judges that the entire Notion integration runs through MCP.

### Terminal output style

Use chalk or ANSI escape codes for colored output:
- Step headers: bold white
- MCP calls: dim cyan with `[MCP]` prefix
- Success: green
- Warnings: yellow
- Critical: red + bold
- AI output: cyan/italic
- Notion URLs: underlined blue

### Demo sequence

```typescript
async function runDemo() {
  printBanner();

  // ═══════════════════════════════════════════
  // STEP 1: Connect to Notion MCP
  // ═══════════════════════════════════════════
  step(1, 'Connecting to Notion MCP server...');
  const mcpClient = new McpClient(config);
  await mcpClient.connect();
  success('Connected to remote Notion MCP (OAuth)');
  // List available tools to show MCP is real
  const tools = await mcpClient.listTools();
  info(`Available MCP tools: ${tools.map(t => t.name).join(', ')}`);
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 2: Read config from Notion via MCP
  // ═══════════════════════════════════════════
  step(2, 'Reading operator config from Notion...');
  mcpLog('notion-fetch', 'Config database');
  const configs = await reader.readConfig();
  const watchlist = await reader.readWatchlist();
  success(`Config: ${configs.length} wallets configured`);
  success(`Watchlist: ${watchlist.length} protocols monitored`);
  if (configs.length === 0) {
    info('No config found — seeding demo data via MCP...');
    await seedDemoConfig(); // creates pages via notion-create-pages
  }
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 3: Fetch live on-chain data
  // ═══════════════════════════════════════════
  step(3, 'Fetching live on-chain data...');
  for (const config of configs) {
    const adapter = adapters.get(config.chain);
    const balances = await adapter.getBalances(config.walletAddress);
    const total = balances.reduce((s, b) => s + (b.valueUsd || 0), 0);
    success(`${config.chain}: ${config.walletAddress.slice(0, 16)}... — $${total.toLocaleString()}`);
  }
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 4: Load DeFi positions + write to Notion via MCP
  // ═══════════════════════════════════════════
  step(4, 'Loading DeFi positions → syncing to Notion...');
  const demoPositions = getDemoPositions();
  for (const pos of demoPositions) {
    const color = pos.healthFactor < 1.0 ? 'red'
      : pos.healthFactor < 1.2 ? 'yellow' : 'green';
    positionLine(pos.protocol, pos.valueUsd, pos.healthFactor, color);
    mcpLog('notion-create-pages', `Position: ${pos.protocol}`);
    await writer.writePosition(/* mapped */);
  }
  success(`Total exposure: $${totalExposure.toLocaleString()}`);
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 5: Risk engine scan
  // ═══════════════════════════════════════════
  step(5, 'Running risk engine...');
  const allSignals = [];
  for (const pos of demoPositions) {
    const signals = await riskEngine.analyzePosition(pos, configs[0]);
    allSignals.push(...signals);
  }
  for (const signal of allSignals) {
    signalLine(signal);
  }
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 6: AI analysis + write to Notion via MCP
  // ═══════════════════════════════════════════
  const criticalSignals = allSignals.filter(s => s.severity === 'critical');
  if (criticalSignals.length > 0) {
    step(6, `Gemini analyzing ${criticalSignals.length} critical signal(s)...`);
    for (const signal of criticalSignals) {
      info(`Analyzing: ${signal.message}`);
      const enriched = await riskEngine.enrichWithAI(signal);
      aiOutput(enriched.aiAnalysis!);
      info(`Recommended: ${enriched.recommendedAction}`);

      mcpLog('notion-create-pages', `Risk event: ${enriched.message} [${enriched.severity}]`);
      await writer.writeRiskEvent(enriched);
      mcpLog('notion-create-pages', `Alert log entry`);
      await writer.writeAlert({
        title: enriched.message,
        chain: enriched.chain,
        severity: enriched.severity,
        details: enriched.aiAnalysis!,
      });
    }
    pause(3000);
  }

  // ═══════════════════════════════════════════
  // STEP 7: Escalation — human in the loop
  // ═══════════════════════════════════════════
  step(7, 'Awaiting human approval in Notion...');
  warning('A critical alert has been escalated.');
  info('');
  info('👉 Open your Notion workspace');
  info('👉 Find the Risk Dashboard database');
  info('👉 Change the Aerodrome event status: "Escalated" → "Approved"');
  info('');
  info('Polling for approval via MCP (every 5s)...');

  let approved = false;
  let pollCount = 0;
  const maxPolls = 60;
  while (!approved && pollCount < maxPolls) {
    mcpLog('notion-fetch', 'Polling Risk Dashboard for approvals...');
    const approvals = await reader.pollEscalations();
    if (approvals.length > 0) {
      approved = true;
      success(`Human approved: ${approvals[0].event}`);
      mcpLog('notion-update-page', `Status → Resolved`);
      mcpLog('notion-create-comment', `Agent acknowledged resolution`);
      await writer.addComment(approvals[0].pageId,
        '✅ VaultRoom agent acknowledged approval. Escalation resolved.'
      );
      success('Agent left comment on Notion page — escalation resolved');
    } else {
      pollCount++;
      process.stdout.write(`  ⏳ Polling via MCP... (${pollCount * 5}s)\r`);
      await sleep(5000);
    }
  }
  if (!approved) {
    warning('Timeout — skipping approval step');
    info('(In production, agent continues monitoring while waiting)');
  }
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 8: Generate daily digest via MCP
  // ═══════════════════════════════════════════
  step(8, 'Generating AI daily digest...');
  mcpLog('notion-create-pages', `Digest page: ${new Date().toISOString().split('T')[0]}`);
  const digestUrl = await generateDigest(reader, writer, adapters, riskEngine, digestBuilder);
  success('Daily digest published to Notion (Markdown → rich Notion page via MCP)');
  notionLink('View digest', digestUrl);
  pause(2000);

  // ═══════════════════════════════════════════
  // STEP 9: Disconnect MCP
  // ═══════════════════════════════════════════
  step(9, 'Shutting down...');
  await mcpClient.disconnect();
  success('MCP connection closed cleanly');

  // SUMMARY
  printSummary({
    walletsMonitored: configs.length,
    positionsTracked: demoPositions.length,
    signalsDetected: allSignals.length,
    criticalAlerts: criticalSignals.length,
    digestPublished: true,
    mcpToolCalls: mcpClient.getCallCount(), // track total MCP calls
  });
}
```

### printBanner()

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏦  V A U L T R O O M                                 ║
║                                                           ║
║   DeFi Risk Agent — Notion MCP Control Plane              ║
║   Built for Notion MCP Challenge 2026                     ║
║                                                           ║
║   MCP Server: https://mcp.notion.com (remote, OAuth)      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

### printSummary()

```
┌─────────────────────────────────────────────┐
│             Demo Complete ✅                 │
├─────────────────────────────────────────────┤
│  Wallets monitored:       2                │
│  Positions tracked:       3                │
│  Signals detected:        2                │
│  Critical alerts:         1                │
│  Digest published:        Yes              │
│  MCP tool calls made:     24               │
├─────────────────────────────────────────────┤
│  MCP Tools Used:                           │
│    notion-fetch           8 calls          │
│    notion-create-pages    7 calls          │
│    notion-update-page     5 calls          │
│    notion-search          2 calls          │
│    notion-create-comment  2 calls          │
├─────────────────────────────────────────────┤
│  Open Notion to explore:                   │
│  → Risk Dashboard: {url}                   │
│  → Positions:      {url}                   │
│  → Digests:        {url}                   │
└─────────────────────────────────────────────┘
```

The MCP call count summary is a flex — it shows judges exactly how deeply
the project uses Notion MCP.

### MCP call counter

Add a call counter to your MCP client or tools wrapper:

```typescript
class NotionTools {
  private callCounts: Map<string, number> = new Map();

  private async callTool(name: string, args: any): Promise<any> {
    this.callCounts.set(name, (this.callCounts.get(name) || 0) + 1);
    logger.debug(`[MCP] ${name} → ${JSON.stringify(args).slice(0, 80)}...`);
    return this.mcp.callTool(name, args);
  }

  getCallCounts(): Map<string, number> { return this.callCounts; }
  getTotalCalls(): number {
    return [...this.callCounts.values()].reduce((a, b) => a + b, 0);
  }
}
```

## README.md — Final polished version

### Key sections:

```markdown
# 🏦 VaultRoom

**Multi-chain DeFi risk agent with Notion as the control plane — powered by Notion MCP.**

> Built for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04) — March 2026

## The Problem

DeFi operators managing positions across multiple chains rely on scattered
tools — Discord bots for alerts, spreadsheets for tracking, Telegram for
coordination. There's no single source of truth, no structured escalation
workflow, and no human-in-the-loop approval for critical actions.

## The Solution

VaultRoom turns Notion into a DeFi risk control plane. An AI agent monitors
on-chain positions, detects anomalies, and writes structured risk analysis
directly into Notion databases — **entirely through Notion MCP**.

Human operators configure thresholds, approve escalations, and receive
AI-written daily digests. All without leaving Notion.

**Notion isn't a dashboard. It's the control plane. MCP is the protocol.**

## Architecture

```
On-chain Data (Blockfrost, Ethereum RPC)
         │
         ▼
┌─────────────────────┐
│   VaultRoom Agent   │
│   ├─ Risk Engine    │
│   ├─ Gemini 2.5 Pro │
│   └─ MCP Client ────┼──── MCP Protocol ────► Notion MCP Server
│                      │     (remote, OAuth)    (hosted by Notion)
└─────────────────────┘                               │
                                                       ▼
                                              Notion Workspace
                                              ├─ ⚙️ Config (human writes)
                                              ├─ 👁️ Watchlist (human writes)
                                              ├─ 🚨 Risk Dashboard (bidirectional)
                                              ├─ 📊 Positions (agent writes)
                                              ├─ 📋 Alert Log (agent writes)
                                              └─ 📝 Digests (agent writes)
```

## Notion MCP Integration

VaultRoom uses **6 Notion MCP tools** as its core integration:

| MCP Tool | How VaultRoom Uses It |
|----------|----------------------|
| `notion-search` | Find databases, locate existing positions for upsert |
| `notion-fetch` | Read Config DB, Watchlist, poll for escalation approvals |
| `notion-create-pages` | Write risk events, positions, alerts, daily digests |
| `notion-update-page` | Update positions, resolve escalations |
| `notion-create-database` | Initial workspace setup |
| `notion-create-comment` | Agent communicates with operators on escalated items |

**Zero `@notionhq/client` usage.** Every Notion interaction goes through MCP.

Page content is written as **Notion-flavored Markdown** — the MCP server
converts tables, callouts, toggles, and lists into rich Notion blocks.

## Data Flow — Bidirectional

**Human → Agent (Notion → MCP → VaultRoom):**
- Set alert thresholds per wallet
- Add/remove wallets and protocols to monitor
- Approve or reject escalated risk events

**Agent → Human (VaultRoom → MCP → Notion):**
- Real-time position tracking with health factors
- AI-analyzed risk events with severity scoring
- Daily portfolio digests with recommendations
- Comments on escalated items acknowledging resolution

## Key Features

### 1. Bidirectional MCP Control
[Screenshot: Config DB + agent reading it]

### 2. AI Risk Analysis (Gemini 2.5 Pro)
[Screenshot: Risk Dashboard entry with AI analysis]

### 3. Human-in-the-Loop Escalation via MCP
[Screenshot: Status change + agent comment in Notion]

### 4. Rich Daily Digests (Markdown → Notion blocks)
[Screenshot: Digest page with tables, callouts, toggles]

### 5. Multi-Chain Monitoring
Cardano (Blockfrost) + Ethereum — real on-chain data.

## Quick Start

### Prerequisites
- Node.js 20+, pnpm
- Notion account with MCP access
- Blockfrost API key (blockfrost.io)
- Gemini API key (aistudio.google.com)

### Setup
1. Clone: `git clone https://github.com/phamthanhhang208/vaultroom.git`
2. Install: `cd vaultroom && pnpm install`
3. Configure: `cp .env.example .env` and fill in keys
4. Setup OAuth: follow MCP OAuth flow for Notion
5. Init workspace: `pnpm run setup`
6. Demo: `pnpm run demo`

## Why This Matters

I build DeFi products professionally — lending protocols on Cardano.
The risk scenarios in VaultRoom reflect real operational challenges.

No other submission in this challenge touches DeFi. VaultRoom brings
genuine domain expertise to a problem DeFi operators face daily.
```

## DEV.to Submission Post Template

The challenge requires a DEV.to post. Draft it with these sections:

1. **What I Built** — VaultRoom one-liner + screenshot
2. **How It Uses Notion MCP** — list the 6 MCP tools and how each is used
3. **Architecture** — the diagram from README
4. **Demo** — embedded video or GIF of the demo script running
5. **The Bidirectional Loop** — explain the human-in-the-loop escalation
6. **Tech Stack** — bullet list
7. **What I Learned** — one paragraph on MCP development experience
8. **Link to repo**

## Screenshots to capture (after demo run)

1. Terminal: demo script running with `[MCP]` logs visible
2. Notion: all 6 databases in sidebar
3. Notion: Config DB with threshold entries
4. Notion: Risk Dashboard with AI analysis + "Escalated" status
5. Notion: Escalated event with agent comment in discussion thread
6. Notion: Position Tracker with health factors
7. Notion: Digest page with rich formatting (tables, callout, toggle)
8. Terminal: demo summary showing MCP tool call counts

## Acceptance criteria

- [ ] `pnpm run demo` runs full sequence, every Notion call logged as `[MCP]`
- [ ] Demo shows MCP tool call counts in summary
- [ ] Demo lists available MCP tools at connection step
- [ ] Escalation step shows `notion-create-comment` (agent commenting in Notion)
- [ ] README has architecture diagram showing MCP protocol layer
- [ ] README has MCP tools table showing all 6 tools used
- [ ] README explicitly states "Zero @notionhq/client usage"
- [ ] DEV.to post drafted with required template sections
- [ ] Screenshots captured with MCP interactions visible
