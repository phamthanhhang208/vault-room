import cron from 'node-cron';
import { McpClient } from './mcp/client.js';
import { NotionTools } from './mcp/tools.js';
import { NotionReader } from './notion/reader.js';
import { NotionWriter } from './notion/writer.js';
import { DigestBuilder } from './notion/digest.js';
import { CardanoAdapter } from './chains/cardano.js';
import { EthereumAdapter } from './chains/ethereum.js';
import type { ChainAdapter } from './chains/types.js';
import { RiskEngine } from './risk/engine.js';
import type { DigestInput } from './risk/engine.js';
import { env, requireDbIds } from './config.js';
import { logger } from './utils/logger.js';
import type { Position } from './types.js';
import { writeDashboardData, buildSnapshot } from './utils/dashboard-writer.js';

interface CycleResult {
  signals: number;
  positions: number;
  approvals: number;
  elapsedMs: number;
}

async function monitorCycle(
  reader: NotionReader,
  writer: NotionWriter,
  adapters: Map<string, ChainAdapter>,
  riskEngine: RiskEngine,
  tools: NotionTools,
): Promise<CycleResult> {
  const cycleStart = Date.now();
  logger.info('─── Monitor cycle starting ───');

  const configs = await reader.readConfig();
  const watchlist = await reader.readWatchlist();
  logger.info(`Config: ${configs.length} wallets | Watchlist: ${watchlist.length} protocols`);

  // Read all tracked positions once — used for health factor checks per wallet
  let allNotionPositions: Position[] = [];
  try {
    allNotionPositions = await reader.readPositions();
  } catch {
    logger.warn('[Cycle] Could not read positions from Notion — health checks will use on-chain data only');
  }

  let totalSignals = 0;
  let totalPositions = 0;

  for (const config of configs) {
    const adapter = adapters.get(config.chain);
    if (!adapter) {
      logger.warn(`[Cycle] No adapter for chain: ${config.chain}`);
      continue;
    }

    try {
      // Fetch on-chain snapshot (balances + txs)
      const snapshot = await adapter.getWalletSnapshot(config.walletAddress);

      // Filter Notion positions for this wallet (for health factor rule checks)
      const walletPositions = allNotionPositions.filter(
        (p) => p.wallet === config.walletAddress && p.chain === config.chain,
      );

      // Run risk detection
      const signals = await riskEngine.detectSignals(snapshot, walletPositions, config);
      totalSignals += signals.length;

      // Write signals to Risk Dashboard + Alert Log via MCP
      for (const signal of signals) {
        await writer.writeRiskEvent(signal);
        await writer.writeAlert({
          title: signal.event,
          chain: signal.chain,
          severity: signal.severity,
          details: signal.aiAnalysis ?? signal.details,
        });
        logger.info(`[Cycle] Signal: [${signal.severity.toUpperCase()}] ${signal.event}`);
      }

      // Upsert wallet position in Positions DB
      const totalValueUsd = snapshot.balances.reduce((sum, b) => sum + (b.valueUsd ?? 0), 0);
      const hasSignals = signals.length > 0;
      const riskLevel: Position['riskLevel'] = signals.some((s) => s.severity === 'critical')
        ? 'danger'
        : signals.some((s) => s.severity === 'high' || s.severity === 'medium')
          ? 'warning'
          : 'safe';

      await writer.writePosition({
        name: `${config.chain} / ${config.walletAddress.slice(0, 12)}...`,
        chain: config.chain,
        protocol: 'wallet',
        wallet: config.walletAddress,
        valueUsd: totalValueUsd,
        healthFactor: hasSignals ? 0 : 1.5,
        riskLevel,
        lastUpdated: new Date().toISOString(),
      });
      totalPositions++;

      // Upsert protocol positions from on-chain snapshot
      for (const pos of snapshot.positions) {
        const posRiskLevel: Position['riskLevel'] =
          pos.healthFactor !== null && pos.healthFactor < 1.0
            ? 'danger'
            : pos.healthFactor !== null && pos.healthFactor < 1.2
              ? 'warning'
              : 'safe';

        await writer.writePosition({
          name: `${pos.protocol} (${config.chain})`,
          chain: config.chain,
          protocol: pos.protocol,
          wallet: config.walletAddress,
          valueUsd: pos.valueUsd,
          healthFactor: pos.healthFactor ?? 0,
          riskLevel: posRiskLevel,
          lastUpdated: new Date().toISOString(),
        });
        totalPositions++;
      }
    } catch (err) {
      logger.error(
        `[Cycle] Failed processing ${config.chain}/${config.walletAddress.slice(0, 12)}...`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  // Check for human approvals in Risk Dashboard (MCP bidirectional showcase)
  const approvals = await reader.pollEscalations();
  for (const approval of approvals) {
    logger.info(`[Cycle] ✅ Escalation approved: ${approval.event} — resolved via MCP comment`);
  }

  // Suppress unused var warning when watchlist features are expanded in v2
  void watchlist;

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(
    `─── Cycle complete: ${totalSignals} signals, ${totalPositions} positions, ${approvals.length} approvals (${elapsed}s) ───`,
  );

  // Write dashboard data.json for the React dashboard
  try {
    const latestPositions = await reader.readPositions();
    const snapshot = buildSnapshot(
      latestPositions,
      [],
      '',
      '',
      Object.fromEntries(tools.getCallCounts()),
    );
    await writeDashboardData(snapshot);
  } catch {
    // Non-critical — dashboard update failure never crashes the cycle
  }

  return {
    signals: totalSignals,
    positions: totalPositions,
    approvals: approvals.length,
    elapsedMs: Date.now() - cycleStart,
  };
}

async function generateDigest(
  reader: NotionReader,
  writer: NotionWriter,
  adapters: Map<string, ChainAdapter>,
  riskEngine: RiskEngine,
  digestBuilder: DigestBuilder,
  tools: NotionTools,
): Promise<string> {
  logger.info('[Digest] Generating daily digest...');

  // Run a fresh monitor cycle for up-to-date data
  await monitorCycle(reader, writer, adapters, riskEngine, tools);

  // Read current state from Notion
  const positions = await reader.readPositions();
  const todayEvents = await reader.readTodayRiskEvents();

  const totalExposure = positions.reduce((sum, p) => sum + p.valueUsd, 0);
  const healthPositions = positions.filter((p) => p.healthFactor > 0);
  const avgHealth =
    healthPositions.length > 0
      ? healthPositions.reduce((sum, p) => sum + p.healthFactor, 0) / healthPositions.length
      : 0;
  const activeAlerts = todayEvents.filter((e) => e.severity !== 'low').length;

  const digestInput: DigestInput = {
    totalExposure,
    avgHealth,
    activeAlerts,
    positions,
    riskEvents: todayEvents,
  };

  // AI analysis via Gemini
  const analysis = await riskEngine.generateDigestAnalysis(digestInput);

  // Write rich Notion page via MCP (Notion-flavored Markdown)
  const date = new Date().toISOString().split('T')[0] ?? new Date().toDateString();
  const pageUrl = await digestBuilder.writeDigest({
    date,
    totalExposure,
    avgHealth,
    activeAlerts,
    positions,
    riskEvents: todayEvents,
    recommendations: analysis.recommendations,
    fullAnalysis: analysis.briefing,
  });

  logger.info(`[Digest] 📝 Published: ${pageUrl}`);

  // Update dashboard with digest content
  try {
    const snapshot = buildSnapshot(
      positions,
      todayEvents,
      analysis.briefing,
      analysis.briefing,
      Object.fromEntries(tools.getCallCounts()),
    );
    await writeDashboardData(snapshot);
  } catch {
    // Non-critical
  }

  return pageUrl;
}

function setupGracefulShutdown(mcpClient: McpClient): void {
  const shutdown = async () => {
    logger.info('VaultRoom shutting down...');
    await mcpClient.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  logger.info('🏦 VaultRoom starting...');
  logger.info(`🌐 Network: ${env.NETWORK_MODE.toUpperCase()}`);
  logger.info(`   Cardano: ${env.BLOCKFROST_NETWORK} | Ethereum: ${env.ETH_RPC_URL.includes('sepolia') ? 'Sepolia' : env.ETH_RPC_URL}`);
  if (env.NETWORK_MODE === 'testnet') {
    logger.info('   ⚠️  Testnet mode — prices are simulated, ERC-20 checks skipped');
  }

  // Connect to remote Notion MCP server via OAuth
  const mcp = await McpClient.connect(env.MCP_ACCESS_TOKEN, env.NOTION_MCP_URL);
  logger.info('✅ Connected to Notion MCP server');

  // Require all DB IDs are configured (populated by pnpm run setup)
  const dbEnv = requireDbIds();

  const tools = new NotionTools(mcp);

  const reader = new NotionReader(tools, {
    config: dbEnv.NOTION_CONFIG_DB_ID,
    watchlist: dbEnv.NOTION_WATCHLIST_DB_ID,
    riskDashboard: dbEnv.NOTION_RISK_DASHBOARD_DB_ID,
    positions: dbEnv.NOTION_POSITIONS_DB_ID,
  });

  const writer = new NotionWriter(tools, {
    riskDashboard: dbEnv.NOTION_RISK_DASHBOARD_DB_ID,
    positions: dbEnv.NOTION_POSITIONS_DB_ID,
    alertLog: dbEnv.NOTION_ALERT_LOG_DB_ID,
  });

  const digestBuilder = new DigestBuilder(tools, dbEnv.NOTION_DIGESTS_PAGE_ID);

  const adapters = new Map<string, ChainAdapter>([
    ['cardano', new CardanoAdapter(env.BLOCKFROST_API_KEY, env.BLOCKFROST_NETWORK)],
    ['ethereum', new EthereumAdapter(env.ETH_RPC_URL)],
  ]);

  const riskEngine = new RiskEngine(env.GEMINI_API_KEY);

  // Handle CLI flags: --once (single cycle) or --digest (generate digest)
  const args = process.argv.slice(2);

  if (args.includes('--once')) {
    await monitorCycle(reader, writer, adapters, riskEngine, tools);
    await mcp.disconnect();
    process.exit(0);
  }

  if (args.includes('--digest')) {
    await generateDigest(reader, writer, adapters, riskEngine, digestBuilder, tools);
    await mcp.disconnect();
    process.exit(0);
  }

  // Continuous mode: read config for polling interval, then schedule
  const configs = await reader.readConfig();
  const minInterval = configs.length > 0 ? Math.min(...configs.map((c) => c.pollingMinutes)) : 5;
  logger.info(`Monitoring ${configs.length} wallet(s) — polling every ${minInterval}m`);

  // Monitor cycle on configured interval
  cron.schedule(`*/${minInterval} * * * *`, async () => {
    try {
      await monitorCycle(reader, writer, adapters, riskEngine, tools);
    } catch (err) {
      logger.error('[Cron] Monitor cycle failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Daily digest at 00:00 UTC
  cron.schedule('0 0 * * *', async () => {
    try {
      await generateDigest(reader, writer, adapters, riskEngine, digestBuilder, tools);
    } catch (err) {
      logger.error('[Cron] Digest generation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Run first cycle immediately
  await monitorCycle(reader, writer, adapters, riskEngine, tools);

  logger.info('VaultRoom running. Press Ctrl+C to stop.');
  setupGracefulShutdown(mcp);
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
