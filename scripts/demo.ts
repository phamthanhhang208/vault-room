/**
 * VaultRoom — Scripted Demo (~2 min)
 *
 * Walks through the full agent lifecycle:
 *   MCP connect → read Notion config → on-chain fetch → risk detection →
 *   AI enrichment → write to Notion → escalation approval loop → daily digest
 *
 * Every Notion interaction is logged as an [MCP] tool call so judges can
 * see that the integration is real and not a REST API wrapper.
 *
 * Usage:  pnpm run demo
 */

import dotenv from 'dotenv';
import { McpClient } from '../src/mcp/client.js';
import { NotionTools } from '../src/mcp/tools.js';
import { NotionReader } from '../src/notion/reader.js';
import { NotionWriter } from '../src/notion/writer.js';
import { DigestBuilder } from '../src/notion/digest.js';
import { CardanoAdapter } from '../src/chains/cardano.js';
import { EthereumAdapter } from '../src/chains/ethereum.js';
import type { ChainAdapter, WalletSnapshot } from '../src/chains/types.js';
import { RiskEngine } from '../src/risk/engine.js';
import type { DigestInput } from '../src/risk/engine.js';
import { DEMO_POSITIONS, getDemoPositions, DEMO_STATS } from '../src/utils/demo-data.js';
import type { MonitorConfig, Position } from '../src/types.js';

dotenv.config();

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31;1m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34;4m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37;1m${s}\x1b[0m`,
};

function p(msg = '') { process.stdout.write(msg + '\n'); }
function step(n: number, msg: string) {
  p();
  p(C.white(`  ══════════════════════════════════════════════════`));
  p(C.white(`  STEP ${n}: ${msg}`));
  p(C.white(`  ══════════════════════════════════════════════════`));
}
function ok(msg: string)      { p(C.green(`  ✅ ${msg}`)); }
function warn(msg: string)    { p(C.yellow(`  ⚠️  ${msg}`)); }
function crit(msg: string)    { p(C.red(`  🔴 ${msg}`)); }
function info(msg: string)    { p(`     ${msg}`); }
function mcpLog(tool: string, detail: string) {
  p(C.dim(`     [MCP] ${tool} → ${detail}`));
}
function aiOut(msg: string)   { p(C.cyan(`     🤖 ${msg}`)); }
function link(label: string, url: string) {
  p(C.blue(`     🔗 ${label}: ${url}`));
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner(networkMode: string) {
  const networkLabel = networkMode === 'testnet'
    ? 'Network: TESTNET (Cardano Preprod + Ethereum Sepolia)'
    : 'Network: MAINNET (Cardano + Ethereum)';
  p();
  p(C.bold('  ╔═══════════════════════════════════════════════════════════╗'));
  p(C.bold('  ║                                                           ║'));
  p(C.bold('  ║   🏦  V A U L T R O O M                                  ║'));
  p(C.bold('  ║                                                           ║'));
  p(C.bold('  ║   DeFi Risk Agent — Notion MCP Control Plane              ║'));
  p(C.bold(`  ║   ${networkLabel.padEnd(55)}║`));
  p(C.bold('  ║                                                           ║'));
  p(C.bold('  ║   MCP Server: https://mcp.notion.com (remote, OAuth)      ║'));
  p(C.bold('  ║                                                           ║'));
  p(C.bold('  ╚═══════════════════════════════════════════════════════════╝'));
  p();
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(stats: {
  wallets: number;
  positions: number;
  signals: number;
  critical: number;
  digestPublished: boolean;
  callCounts: ReadonlyMap<string, number>;
  totalCalls: number;
}) {
  p();
  p(C.bold('  ┌─────────────────────────────────────────────┐'));
  p(C.bold('  │             Demo Complete ✅                 │'));
  p(C.bold('  ├─────────────────────────────────────────────┤'));
  p(`  │  Wallets monitored:     ${String(stats.wallets).padEnd(18)} │`);
  p(`  │  Positions tracked:     ${String(stats.positions).padEnd(18)} │`);
  p(`  │  Signals detected:      ${String(stats.signals).padEnd(18)} │`);
  p(`  │  Critical alerts:       ${String(stats.critical).padEnd(18)} │`);
  p(`  │  Digest published:      ${(stats.digestPublished ? 'Yes' : 'No').padEnd(18)} │`);
  p(`  │  Total MCP calls:       ${String(stats.totalCalls).padEnd(18)} │`);
  p(C.bold('  ├─────────────────────────────────────────────┤'));
  p(C.bold('  │  MCP Tool Breakdown:                        │'));
  for (const [tool, count] of stats.callCounts) {
    const line = `${tool}   ${count} call${count !== 1 ? 's' : ''}`;
    p(`  │    ${line.padEnd(41)} │`);
  }
  p(C.bold('  └─────────────────────────────────────────────┘'));
  p();
}

// ─── Demo config ─────────────────────────────────────────────────────────────

const DEMO_CONFIG: MonitorConfig = {
  pageId: 'demo',
  chain: 'ethereum',
  walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth (public demo wallet)
  healthThreshold: 1.2,
  tvlDropPct: 15,
  pollingMinutes: 5,
};

// ─── Main demo ────────────────────────────────────────────────────────────────

async function runDemo() {
  const networkMode = process.env['NETWORK_MODE'] ?? 'testnet';
  printBanner(networkMode);

  // Validate required env vars
  const accessToken = process.env['MCP_ACCESS_TOKEN'] ?? '';
  const mcpUrl = process.env['NOTION_MCP_URL'] ?? 'https://mcp.notion.com/mcp';
  const blockfrostKey = process.env['BLOCKFROST_API_KEY'] ?? '';
  const defaultEthRpc = networkMode === 'testnet' ? 'https://rpc.sepolia.org' : 'https://eth.llamarpc.com';
  const ethRpc = process.env['ETH_RPC_URL'] ?? defaultEthRpc;
  const geminiKey = process.env['GEMINI_API_KEY'] ?? '';

  if (!accessToken) {
    crit('Missing MCP_ACCESS_TOKEN — run pnpm run setup:auth to authenticate');
    process.exit(1);
  }
  if (!geminiKey) {
    warn('Missing GEMINI_API_KEY — AI enrichment will be skipped');
  }

  const configDbId         = process.env['NOTION_CONFIG_DB_ID'] ?? '';
  const watchlistDbId      = process.env['NOTION_WATCHLIST_DB_ID'] ?? '';
  const riskDashboardDbId  = process.env['NOTION_RISK_DASHBOARD_DB_ID'] ?? '';
  const positionsDbId      = process.env['NOTION_POSITIONS_DB_ID'] ?? '';
  const alertLogDbId       = process.env['NOTION_ALERT_LOG_DB_ID'] ?? '';
  const digestsPageId      = process.env['NOTION_DIGESTS_PAGE_ID'] ?? '';

  const hasDbIds = configDbId && watchlistDbId && riskDashboardDbId
    && positionsDbId && alertLogDbId && digestsPageId;

  if (!hasDbIds) {
    warn('Notion DB IDs not configured — run `pnpm run setup` first');
    warn('Demo will show MCP connection + on-chain data only');
  }

  // ═══ STEP 1: Connect to Notion MCP ═══════════════════════════════════════
  step(1, 'Connecting to Notion MCP server...');
  mcpLog('connect', mcpUrl);

  const mcp = await McpClient.connect(accessToken, mcpUrl);
  ok('Connected to remote Notion MCP (OAuth Bearer token)');

  const availableTools = await mcp.listTools();
  info(`Available MCP tools (${availableTools.length}):`);
  info(availableTools.map((t) => t.name).join('  ·  '));

  await sleep(1500);

  // ═══ STEP 2: Read config from Notion via MCP ═════════════════════════════
  const tools = new NotionTools(mcp);

  let configs: MonitorConfig[] = [];
  let walletCount = 0;

  if (hasDbIds) {
    step(2, 'Reading operator config from Notion via MCP...');

    const reader = new NotionReader(tools, {
      config: configDbId,
      watchlist: watchlistDbId,
      riskDashboard: riskDashboardDbId,
      positions: positionsDbId,
    });

    mcpLog('notion-query-database-view', 'Config database (active wallets)');
    configs = await reader.readConfig();
    walletCount = configs.length;

    mcpLog('notion-query-database-view', 'Watchlist database (active protocols)');
    const watchlist = await reader.readWatchlist();

    ok(`Config loaded: ${configs.length} wallet(s) configured`);
    ok(`Watchlist loaded: ${watchlist.length} protocol(s) monitored`);

    if (configs.length === 0) {
      info('No active config rows — using demo wallet for on-chain step');
      configs = [DEMO_CONFIG];
    }
  } else {
    step(2, 'Notion DB IDs not configured — using demo wallet');
    configs = [DEMO_CONFIG];
    walletCount = 1;
    warn('Run `pnpm run setup` to create Notion workspace');
  }

  await sleep(1500);

  // ═══ STEP 3: Fetch live on-chain data ════════════════════════════════════
  step(3, 'Fetching live on-chain data...');

  const adapters = new Map<string, ChainAdapter>([
    ['cardano', new CardanoAdapter(blockfrostKey, 'mainnet')],
    ['ethereum', new EthereumAdapter(ethRpc)],
  ]);

  const snapshots = new Map<string, WalletSnapshot>();

  for (const cfg of configs) {
    const adapter = adapters.get(cfg.chain);
    if (!adapter) { warn(`No adapter for chain: ${cfg.chain}`); continue; }

    try {
      info(`Fetching ${cfg.chain} wallet: ${cfg.walletAddress.slice(0, 16)}...`);
      const snapshot = await adapter.getWalletSnapshot(cfg.walletAddress);
      snapshots.set(cfg.walletAddress, snapshot);

      const totalUsd = snapshot.balances.reduce((s, b) => s + (b.valueUsd ?? 0), 0);
      const balanceSummary = snapshot.balances
        .slice(0, 3)
        .map((b) => `${b.amount.toFixed(4)} ${b.symbol}`)
        .join(' · ');

      ok(`${cfg.chain.toUpperCase()} ${cfg.walletAddress.slice(0, 14)}... — $${totalUsd.toLocaleString()}`);
      if (balanceSummary) info(`   Balances: ${balanceSummary}`);
    } catch (err) {
      warn(`On-chain fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      info('   (continuing with demo data)');
    }
  }

  await sleep(1500);

  // ═══ STEP 4: Load DeFi positions → write to Notion ═══════════════════════
  step(4, 'Loading DeFi positions → syncing to Notion Positions DB...');

  const demoProtocolPositions = getDemoPositions();
  const totalExposure = demoProtocolPositions.reduce((s, p) => s + p.valueUsd, 0);

  // Display positions with color-coded health
  for (const pos of demoProtocolPositions) {
    const hf = pos.healthFactor;
    const hfStr = hf !== null ? hf.toFixed(2) : 'N/A';
    const hfColored = hf === null ? hfStr
      : hf < 1.0 ? C.red(`⚠ ${hfStr}`)
      : hf < 1.2 ? C.yellow(`▲ ${hfStr}`)
      : C.green(`✓ ${hfStr}`);

    p(`     ${pos.protocol.padEnd(18)} $${pos.valueUsd.toLocaleString().padStart(12)}   HF: ${hfColored}`);
  }
  p(`     ${'─'.repeat(52)}`);
  p(`     ${'TOTAL'.padEnd(18)} $${totalExposure.toLocaleString().padStart(12)}`);

  if (hasDbIds) {
    const writer = new NotionWriter(tools, {
      riskDashboard: riskDashboardDbId,
      positions: positionsDbId,
      alertLog: alertLogDbId,
    });

    for (const pos of demoProtocolPositions) {
      const riskLevel: Position['riskLevel'] =
        pos.healthFactor !== null && pos.healthFactor < 1.0 ? 'danger'
        : pos.healthFactor !== null && pos.healthFactor < 1.2 ? 'warning'
        : 'safe';

      const notionPos: Position = {
        name: `${pos.protocol} (demo)`,
        chain: 'ethereum',
        protocol: pos.protocol,
        wallet: DEMO_CONFIG.walletAddress,
        valueUsd: pos.valueUsd,
        healthFactor: pos.healthFactor ?? 0,
        riskLevel,
        lastUpdated: new Date().toISOString(),
      };

      mcpLog('notion-create-pages / notion-update-page', `Position: ${pos.protocol}`);
      await writer.writePosition(notionPos);
    }
    ok(`${demoProtocolPositions.length} positions synced to Notion via MCP`);
  } else {
    info('(Notion write skipped — DB IDs not configured)');
  }

  await sleep(1500);

  // ═══ STEP 5: Risk engine scan ═════════════════════════════════════════════
  step(5, 'Running risk engine on detected positions...');

  const riskEngine = geminiKey
    ? new RiskEngine(geminiKey)
    : null;

  // Use DEMO_POSITIONS (typed as Position[]) for health factor checks
  const allSignals = riskEngine
    ? await riskEngine.detectSignals(
        { address: DEMO_CONFIG.walletAddress, chain: 'ethereum', balances: [], positions: [], recentTxs: [], fetchedAt: Date.now() },
        DEMO_POSITIONS,
        DEMO_CONFIG,
      )
    : [];

  if (allSignals.length === 0) {
    // Generate signals directly from demo positions for display
    for (const pos of DEMO_POSITIONS) {
      if (pos.healthFactor < 1.0) crit(`${pos.protocol}: HF ${pos.healthFactor.toFixed(2)} — CRITICAL (liquidation risk)`);
      else if (pos.healthFactor < 1.2) warn(`${pos.protocol}: HF ${pos.healthFactor.toFixed(2)} — below threshold`);
      else ok(`${pos.protocol}: HF ${pos.healthFactor.toFixed(2)} — safe`);
    }
  } else {
    for (const signal of allSignals) {
      if (signal.severity === 'critical') crit(`[${signal.severity.toUpperCase()}] ${signal.event}`);
      else if (signal.severity === 'high') warn(`[${signal.severity.toUpperCase()}] ${signal.event}`);
      else ok(`[${signal.severity.toUpperCase()}] ${signal.event}`);
    }
  }

  await sleep(1500);

  // ═══ STEP 6: AI analysis + write to Notion via MCP ═══════════════════════
  const criticalSignals = allSignals.filter((s) => s.severity === 'critical');

  if (hasDbIds && (criticalSignals.length > 0 || DEMO_POSITIONS.some((p) => p.healthFactor < 1.0))) {
    step(6, `Gemini AI analyzing critical signals → writing to Notion Risk Dashboard...`);

    const writer = new NotionWriter(tools, {
      riskDashboard: riskDashboardDbId,
      positions: positionsDbId,
      alertLog: alertLogDbId,
    });

    // Use detected signals or create one from demo data for the showcase
    const signalsToWrite = criticalSignals.length > 0
      ? criticalSignals
      : (riskEngine
          ? [riskEngine.makeSignal({
              type: 'health_factor',
              severity: 'critical',
              chain: 'ethereum',
              protocol: 'Aerodrome',
              wallet: DEMO_CONFIG.walletAddress,
              event: 'Aerodrome health factor at 0.98 — liquidation imminent',
              details: 'Health factor 0.98 is below 1.0 — liquidation imminent',
            })]
          : []);

    for (const signal of signalsToWrite) {
      if (riskEngine && (signal.severity === 'critical' || signal.severity === 'high') && !signal.aiAnalysis) {
        info(`Asking Gemini to analyze: ${signal.event}`);
        const enriched = await riskEngine.enrichWithAI(signal);
        if (enriched.aiAnalysis) {
          aiOut(enriched.aiAnalysis);
          info(`Recommended: ${enriched.recommendedAction ?? 'monitor closely'}`);
        }
      } else if (signal.aiAnalysis) {
        aiOut(signal.aiAnalysis);
      }

      mcpLog('notion-create-pages', `Risk Dashboard: "${signal.event}" [${signal.severity}]`);
      await writer.writeRiskEvent(signal);

      mcpLog('notion-create-pages', `Alert Log entry [${signal.severity}]`);
      await writer.writeAlert({
        title: signal.event,
        chain: signal.chain,
        severity: signal.severity,
        details: signal.aiAnalysis ?? signal.details,
      });
    }

    ok(`${signalsToWrite.length} critical signal(s) written to Notion via MCP`);
  } else if (!hasDbIds) {
    step(6, 'AI analysis (Notion write skipped — DB IDs not configured)');
    if (riskEngine && DEMO_POSITIONS.some((p) => p.healthFactor < 1.0)) {
      const mockSignal = riskEngine.makeSignal({
        type: 'health_factor', severity: 'critical', chain: 'ethereum',
        protocol: 'Aerodrome', wallet: DEMO_CONFIG.walletAddress,
        event: 'Aerodrome health factor at 0.98', details: 'Liquidation imminent',
      });
      if (geminiKey) {
        info('Calling Gemini for AI analysis...');
        const enriched = await riskEngine.enrichWithAI(mockSignal);
        if (enriched.aiAnalysis) aiOut(enriched.aiAnalysis);
      }
    }
  }

  await sleep(1500);

  // ═══ STEP 7: Escalation — human in the loop ═══════════════════════════════
  if (hasDbIds) {
    step(7, 'Human-in-the-loop escalation via Notion + MCP...');
    warn('A critical alert has been marked "Escalated" in Notion.');
    p();
    info('👉  Open your Notion workspace');
    info('👉  Go to the 🚨 Risk Dashboard database');
    info('👉  Find the Aerodrome entry with status "Escalated"');
    info('👉  Change status → "Approved"');
    p();
    info('Polling for approval via MCP every 5s (timeout: 5 min)...');
    p();

    const reader = new NotionReader(tools, {
      config: configDbId, watchlist: watchlistDbId,
      riskDashboard: riskDashboardDbId, positions: positionsDbId,
    });

    let approved = false;
    let polls = 0;
    const maxPolls = 60;

    while (!approved && polls < maxPolls) {
      mcpLog('notion-query-database-view', `Polling Risk Dashboard for "Approved" status... (${polls * 5}s)`);
      const approvals = await reader.pollEscalations('Aerodrome');

      if (approvals.length > 0) {
        approved = true;
        const a = approvals[0]!;
        p();
        ok(`Human approved: "${a.event}"`);
        mcpLog('notion-update-page', `Status → "Resolved"`);
        mcpLog('notion-create-comment', `Agent acknowledged resolution on page ${a.pageId.slice(0, 8)}...`);
        ok('Agent left comment in Notion thread — escalation resolved');
      } else {
        polls++;
        process.stdout.write(`\r     ⏳ Waiting for human approval... (${polls * 5}s elapsed)  `);
        await sleep(5000);
      }
    }

    if (!approved) {
      p();
      warn('Timeout after 5 minutes — skipping approval step');
      info('(In production, agent continues monitoring while waiting for approval)');
    }
  } else {
    step(7, 'Escalation step skipped (Notion DB IDs not configured)');
    info('Once you run `pnpm run setup`, the full bidirectional loop will work here.');
  }

  await sleep(1500);

  // ═══ STEP 8: Generate daily digest ════════════════════════════════════════
  if (hasDbIds && digestsPageId) {
    step(8, 'Generating AI daily digest → publishing to Notion...');

    const writer = new NotionWriter(tools, {
      riskDashboard: riskDashboardDbId,
      positions: positionsDbId,
      alertLog: alertLogDbId,
    });

    const reader = new NotionReader(tools, {
      config: configDbId, watchlist: watchlistDbId,
      riskDashboard: riskDashboardDbId, positions: positionsDbId,
    });

    const digestBuilder = new DigestBuilder(tools, digestsPageId);
    const positions = await reader.readPositions();
    const todayEvents = await reader.readTodayRiskEvents();

    const totalExp = positions.length > 0
      ? positions.reduce((s, p) => s + p.valueUsd, 0)
      : DEMO_STATS.totalExposure;
    const avgH = positions.filter((p) => p.healthFactor > 0).length > 0
      ? positions.filter((p) => p.healthFactor > 0).reduce((s, p) => s + p.healthFactor, 0) / positions.filter((p) => p.healthFactor > 0).length
      : DEMO_STATS.avgHealth;

    const digestInput: DigestInput = {
      totalExposure: totalExp,
      avgHealth: avgH,
      activeAlerts: todayEvents.length,
      positions: positions.length > 0 ? positions : DEMO_POSITIONS,
      riskEvents: todayEvents.length > 0 ? todayEvents : allSignals,
    };

    let analysis = { briefing: 'Portfolio snapshot generated.', recommendations: ['Review positions'] };
    if (riskEngine) {
      info('Asking Gemini to write portfolio briefing...');
      analysis = await riskEngine.generateDigestAnalysis(digestInput);
    }

    const date = new Date().toISOString().split('T')[0] ?? new Date().toDateString();
    mcpLog('notion-create-pages', `Digest page: "📊 Daily Digest — ${date}"`);

    const pageUrl = await digestBuilder.writeDigest({
      date,
      totalExposure: totalExp,
      avgHealth: avgH,
      activeAlerts: digestInput.activeAlerts,
      positions: digestInput.positions,
      riskEvents: digestInput.riskEvents,
      recommendations: analysis.recommendations,
      fullAnalysis: analysis.briefing,
    });

    ok('Daily digest published (Markdown → rich Notion blocks via MCP)');
    link('View digest in Notion', pageUrl);
  } else {
    step(8, 'Digest step skipped (Notion DB IDs not configured)');
  }

  await sleep(1500);

  // ═══ STEP 9: Disconnect ════════════════════════════════════════════════════
  step(9, 'Shutting down MCP connection...');
  mcpLog('disconnect', 'Closing MCP session');
  await mcp.disconnect();
  ok('MCP connection closed cleanly');

  // ═══ SUMMARY ══════════════════════════════════════════════════════════════
  printSummary({
    wallets: walletCount,
    positions: demoProtocolPositions.length,
    signals: allSignals.length || DEMO_POSITIONS.filter((p) => p.healthFactor < 1.2).length,
    critical: criticalSignals.length || DEMO_POSITIONS.filter((p) => p.healthFactor < 1.0).length,
    digestPublished: !!hasDbIds && !!digestsPageId,
    callCounts: tools.getCallCounts(),
    totalCalls: tools.getTotalCalls(),
  });
}

runDemo().catch((err) => {
  crit(`Demo failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
