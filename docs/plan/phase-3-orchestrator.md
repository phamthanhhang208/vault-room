# VaultRoom — Phase 3: Orchestrator + Scheduler

> **Time estimate:** ~1 day
> **Priority:** HIGH — wires everything into the main loop
> **Depends on:** Phase 1 (MCP Notion layer) + Phase 2 (chains + risk engine)

## Goal

Connect all components into a single orchestrated loop. After this phase,
`pnpm dev` starts continuous monitoring and `pnpm run cycle` does a single
pass — reading config from Notion via MCP, checking chains, running risk
detection, writing results back via MCP, and checking for human approvals.

## MCP Lifecycle Management

The remote Notion MCP connection (OAuth) must be established at startup
and maintained across cycles. The MCP client from Phase 0 handles this,
but the orchestrator needs to:

1. Initialize MCP client + authenticate at startup
2. Keep the connection alive across cron cycles
3. Handle OAuth token refresh if access token expires (1 hour lifetime)
4. Gracefully reconnect if MCP connection drops

```typescript
// In index.ts startup:
const mcpClient = new McpClient(config); // from Phase 0
await mcpClient.connect(); // establishes MCP session

// Pass to all Notion-facing components
const notionTools = new NotionTools(mcpClient);
const reader = new NotionReader(notionTools, config);
const writer = new NotionWriter(notionTools, config);
const digestBuilder = new DigestBuilder(notionTools, config);
```

## src/index.ts — Main orchestrator

### Startup sequence

```typescript
async function main() {
  // 1. Load and validate config
  const env = loadConfig();
  logger.info('🏦 VaultRoom starting...');

  // 2. Initialize MCP client (connects to remote Notion MCP)
  const mcpClient = new McpClient(env);
  await mcpClient.connect();
  logger.info('✅ Connected to Notion MCP server');

  // 3. Initialize services
  const notionTools = new NotionTools(mcpClient);
  const reader = new NotionReader(notionTools, env);
  const writer = new NotionWriter(notionTools, env);
  const digestBuilder = new DigestBuilder(notionTools, env);

  const cardanoAdapter = new CardanoAdapter(env.BLOCKFROST_API_KEY, env.BLOCKFROST_NETWORK);
  const ethereumAdapter = new EthereumAdapter(env.ETH_RPC_URL);
  const adapters = new Map<string, ChainAdapter>([
    ['cardano', cardanoAdapter],
    ['ethereum', ethereumAdapter],
  ]);

  const riskEngine = new RiskEngine(env.GEMINI_API_KEY);

  // 4. Parse CLI flags
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    await monitorCycle(reader, writer, adapters, riskEngine);
    await mcpClient.disconnect();
    process.exit(0);
  }
  if (args.includes('--digest')) {
    await generateDigest(reader, writer, adapters, riskEngine, digestBuilder);
    await mcpClient.disconnect();
    process.exit(0);
  }

  // 5. Read initial config to determine polling interval
  const configs = await reader.readConfig();
  const minInterval = Math.min(...configs.map(c => c.pollingMinutes), 5);
  logger.info(`Monitoring ${configs.length} wallets — polling every ${minInterval}m`);

  // 6. Schedule monitor cycle
  cron.schedule(`*/${minInterval} * * * *`, async () => {
    try {
      await monitorCycle(reader, writer, adapters, riskEngine);
    } catch (err) {
      logger.error('Monitor cycle failed', { error: err });
      // If MCP disconnected, try reconnecting
      if (isMcpConnectionError(err)) {
        logger.warn('MCP connection lost — reconnecting...');
        await mcpClient.reconnect();
      }
    }
  });

  // 7. Schedule daily digest at 00:00 UTC
  cron.schedule('0 0 * * *', async () => {
    try {
      await generateDigest(reader, writer, adapters, riskEngine, digestBuilder);
    } catch (err) {
      logger.error('Digest generation failed', { error: err });
    }
  });

  // 8. Run first cycle immediately
  await monitorCycle(reader, writer, adapters, riskEngine);

  logger.info('VaultRoom running. Press Ctrl+C to stop.');
  setupGracefulShutdown(mcpClient);
}
```

### monitorCycle function

```typescript
async function monitorCycle(
  reader: NotionReader,
  writer: NotionWriter,
  adapters: Map<string, ChainAdapter>,
  riskEngine: RiskEngine,
): Promise<CycleResult> {
  const cycleStart = Date.now();
  logger.info('─── Monitor cycle starting ───');

  // 1. Read latest config from Notion via MCP
  const configs = await reader.readConfig();
  const watchlist = await reader.readWatchlist();
  logger.info(`Config: ${configs.length} wallets | Watchlist: ${watchlist.length} protocols`);

  let totalSignals = 0;
  let totalPositions = 0;

  // 2. Process each config entry
  for (const config of configs) {
    const adapter = adapters.get(config.chain);
    if (!adapter) {
      logger.warn(`No adapter for chain: ${config.chain}`);
      continue;
    }

    try {
      // 2a. Fetch on-chain data
      const balances = await adapter.getBalances(config.walletAddress);
      const txs = await adapter.getRecentTxs(config.walletAddress, 10);

      // 2b. Fetch protocol positions (if adapter supports it)
      const positions: ProtocolPosition[] = [];
      const relevantProtocols = watchlist.filter(w => w.chain === config.chain);
      for (const wp of relevantProtocols) {
        if (adapter.getProtocolPosition) {
          const pos = await adapter.getProtocolPosition(config.walletAddress, wp.protocol);
          if (pos) positions.push(pos);
        }
      }

      // 2c. Run risk engine
      const signals = await riskEngine.analyze(config, balances, txs, positions);
      totalSignals += signals.length;

      // 2d. Write signals to Notion via MCP
      for (const signal of signals) {
        await writer.writeRiskEvent(signal);
        await writer.writeAlert({
          title: signal.message,
          chain: signal.chain,
          severity: signal.severity,
          details: signal.aiAnalysis || signal.message,
        });
        logger.info(`Signal: [${signal.severity.toUpperCase()}] ${signal.message}`);
      }

      // 2e. Update position tracker via MCP
      const totalBalance = balances.reduce((sum, b) => sum + (b.valueUsd || 0), 0);
      await writer.writePosition({
        name: `${config.chain}/${config.walletAddress.slice(0, 12)}...`,
        chain: config.chain,
        protocol: 'wallet',
        wallet: config.walletAddress,
        valueUsd: totalBalance,
        healthFactor: 0,
        riskLevel: signals.some(s => s.severity === 'critical') ? 'danger'
          : signals.some(s => s.severity === 'high') ? 'warning' : 'safe',
      });
      totalPositions++;

      for (const pos of positions) {
        await writer.writePosition({
          name: `${pos.protocol} (${config.chain})`,
          chain: config.chain,
          protocol: pos.protocol,
          wallet: config.walletAddress,
          valueUsd: pos.valueUsd,
          healthFactor: pos.healthFactor || 0,
          riskLevel: (pos.healthFactor && pos.healthFactor < 1.0) ? 'danger'
            : (pos.healthFactor && pos.healthFactor < 1.2) ? 'warning' : 'safe',
        });
        totalPositions++;
      }
    } catch (err) {
      logger.error(`Failed processing ${config.chain}/${config.walletAddress}`, { error: err });
    }
  }

  // 3. Check for human approvals via MCP
  const approvals = await reader.pollEscalations();
  for (const approval of approvals) {
    logger.info(`✅ Escalation approved: ${approval.event} — resolving`);
    // Add a comment via MCP to acknowledge resolution
    await writer.addComment(approval.pageId,
      `✅ VaultRoom agent acknowledged approval and marked as resolved at ${new Date().toISOString()}`
    );
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`─── Cycle complete: ${totalSignals} signals, ${totalPositions} positions, ${approvals.length} approvals (${elapsed}s) ───`);

  return { signals: totalSignals, positions: totalPositions, approvals: approvals.length, elapsedMs: Date.now() - cycleStart };
}
```

### MCP-specific: comment on escalation resolution

When the agent resolves an escalation, it should leave a `notion-create-comment`
on the page — this shows up in Notion's comment thread and demonstrates
the agent "communicating" with the human operator inside Notion itself.
Judges will love this bidirectional interaction.

### generateDigest function

```typescript
async function generateDigest(
  reader: NotionReader,
  writer: NotionWriter,
  adapters: Map<string, ChainAdapter>,
  riskEngine: RiskEngine,
  digestBuilder: DigestBuilder,
): Promise<string> {
  logger.info('Generating daily digest...');

  // 1. Run a monitor cycle first for fresh data
  await monitorCycle(reader, writer, adapters, riskEngine);

  // 2. Gather current state from Notion via MCP
  const positions = await reader.readPositions();
  const todayEvents = await reader.readTodayRiskEvents();

  // 3. Compute stats
  const totalExposure = positions.reduce((sum, p) => sum + p.valueUsd, 0);
  const healthPositions = positions.filter(p => p.healthFactor > 0);
  const avgHealth = healthPositions.length > 0
    ? healthPositions.reduce((sum, p) => sum + p.healthFactor, 0) / healthPositions.length
    : 0;
  const activeAlerts = todayEvents.filter(e => e.status !== 'Resolved').length;

  // 4. AI analysis via Gemini
  const analysis = await riskEngine.generateDigestAnalysis({
    totalExposure, avgHealth, activeAlerts, positions, riskEvents: todayEvents,
  });

  // 5. Write rich digest page via MCP (Notion-flavored Markdown)
  const pageUrl = await digestBuilder.writeDigest({
    date: new Date().toISOString().split('T')[0],
    totalExposure, avgHealth, activeAlerts,
    positions, riskEvents: todayEvents,
    recommendations: analysis.recommendations,
    fullAnalysis: analysis.briefing,
  });

  logger.info(`📝 Digest published: ${pageUrl}`);
  return pageUrl;
}
```

### Graceful shutdown

```typescript
function setupGracefulShutdown(mcpClient: McpClient) {
  const shutdown = async () => {
    logger.info('VaultRoom shutting down...');
    await mcpClient.disconnect(); // clean MCP disconnect
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

## Additional reader methods (add to Phase 1 reader)

### readPositions(): Promise<Position[]>
- Query Positions DB via `notion-fetch` or `notion-query-database-view`
- Return all current positions

### readTodayRiskEvents(): Promise<RiskEvent[]>
- Query Risk Dashboard via MCP, filter by today's date
- Return with status field for active/resolved filtering

## Testing checklist

1. **Single cycle (`pnpm run cycle`):**
   - MCP connects → reads config → fetches on-chain → writes back → disconnects
   - Check Notion: Position Tracker + Alert Log entries appear

2. **Escalation with MCP comment:**
   - Create escalated entry via writer
   - Approve in Notion UI
   - Run cycle → check Notion comment thread shows agent acknowledgment

3. **Digest generation (`pnpm run digest`):**
   - Generates rich Markdown page via MCP
   - Toggle, tables, callouts all render in Notion

4. **Continuous mode (`pnpm dev`):**
   - MCP connection stays alive across multiple cron cycles
   - Ctrl+C → clean MCP disconnect

5. **MCP reconnection:**
   - Simulate connection drop → agent reconnects on next cycle

## Acceptance criteria

- [ ] `pnpm run cycle` completes full pass with MCP read + write
- [ ] `pnpm run digest` generates rich Notion page via MCP
- [ ] `pnpm dev` maintains MCP connection across cron cycles
- [ ] Escalation resolution leaves a Notion comment via MCP
- [ ] Config changes in Notion picked up on next cycle via MCP
- [ ] Graceful MCP disconnect on shutdown
- [ ] One failed wallet doesn't crash the cycle
- [ ] Zero TypeScript errors
