/**
 * VaultRoom — Notion Workspace Setup
 *
 * Creates all 6 Notion DBs via the remote Notion MCP server.
 * Requires: NOTION_ACCESS_TOKEN and NOTION_PARENT_PAGE_ID in .env
 *
 * Usage:
 *   pnpm run setup
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { z } from 'zod';
import { McpClient } from '../src/mcp/client.js';
import { NotionTools } from '../src/mcp/tools.js';

dotenv.config();

const setupEnvSchema = z.object({
  NOTION_ACCESS_TOKEN: z.string().min(1, 'Missing NOTION_ACCESS_TOKEN — authenticate at https://notion.so/my-integrations then copy your OAuth token'),
  NOTION_PARENT_PAGE_ID: z.string().min(1, 'Missing NOTION_PARENT_PAGE_ID — create a blank Notion page and copy its ID from the URL'),
  NOTION_MCP_URL: z.string().url().default('https://mcp.notion.com/mcp'),
});

const envResult = setupEnvSchema.safeParse(process.env);
if (!envResult.success) {
  const errors = envResult.error.issues.map((i) => `  • ${i.message}`).join('\n');
  console.error(`\n❌ Configuration errors:\n${errors}\n`);
  process.exit(1);
}

const { NOTION_ACCESS_TOKEN, NOTION_PARENT_PAGE_ID, NOTION_MCP_URL } = envResult.data;

async function main() {
  console.log('\n🏦 VaultRoom — Notion Workspace Setup\n');
  console.log(`Parent page: ${NOTION_PARENT_PAGE_ID}`);
  console.log(`MCP server: ${NOTION_MCP_URL}\n`);

  // Connect to Notion MCP
  const mcp = await McpClient.connect(NOTION_ACCESS_TOKEN, NOTION_MCP_URL);
  const tools = new NotionTools(mcp);

  // 1. ⚙️ Config DB
  console.log('Creating ⚙️ Config DB...');
  const configDbId = await tools.createDatabase(NOTION_PARENT_PAGE_ID, '⚙️ Config', {
    name: { title: {} },
    chain: {
      select: {
        options: [
          { name: 'Cardano', color: 'blue' },
          { name: 'Ethereum', color: 'purple' },
        ],
      },
    },
    wallet_address: { rich_text: {} },
    health_factor_threshold: { number: { format: 'number' } },
    tvl_drop_pct: { number: { format: 'number' } },
    polling_minutes: { number: { format: 'number' } },
    active: { checkbox: {} },
  });
  if (!configDbId) throw new Error('Failed to create Config DB — check MCP connection');
  console.log(`  ✅ Config DB: ${configDbId}`);

  // 2. 👁️ Watchlist DB
  console.log('Creating 👁️ Watchlist DB...');
  const watchlistDbId = await tools.createDatabase(NOTION_PARENT_PAGE_ID, '👁️ Watchlist', {
    protocol: { title: {} },
    chain: {
      select: {
        options: [
          { name: 'Cardano', color: 'blue' },
          { name: 'Ethereum', color: 'purple' },
        ],
      },
    },
    contract_address: { rich_text: {} },
    watch_type: {
      multi_select: {
        options: [
          { name: 'tvl', color: 'green' },
          { name: 'whale', color: 'orange' },
          { name: 'health', color: 'red' },
          { name: 'yield', color: 'yellow' },
        ],
      },
    },
    active: { checkbox: {} },
  });
  if (!watchlistDbId) throw new Error('Failed to create Watchlist DB');
  console.log(`  ✅ Watchlist DB: ${watchlistDbId}`);

  // 3. 🚨 Risk Dashboard DB
  console.log('Creating 🚨 Risk Dashboard DB...');
  const riskDashboardDbId = await tools.createDatabase(NOTION_PARENT_PAGE_ID, '🚨 Risk Dashboard', {
    event: { title: {} },
    chain: {
      select: {
        options: [
          { name: 'Cardano', color: 'blue' },
          { name: 'Ethereum', color: 'purple' },
        ],
      },
    },
    protocol: { rich_text: {} },
    severity: {
      select: {
        options: [
          { name: '🟢 Low', color: 'green' },
          { name: '🟡 Medium', color: 'yellow' },
          { name: '🟠 High', color: 'orange' },
          { name: '🔴 Critical', color: 'red' },
        ],
      },
    },
    detected_at: { date: {} },
    ai_analysis: { rich_text: {} },
    recommended_action: { rich_text: {} },
    status: {
      select: {
        options: [
          { name: 'New', color: 'gray' },
          { name: 'Acknowledged', color: 'blue' },
          { name: 'Escalated', color: 'orange' },
          { name: 'Approved', color: 'green' },
          { name: 'Resolved', color: 'default' },
        ],
      },
    },
  });
  if (!riskDashboardDbId) throw new Error('Failed to create Risk Dashboard DB');
  console.log(`  ✅ Risk Dashboard DB: ${riskDashboardDbId}`);

  // 4. 📊 Positions DB
  console.log('Creating 📊 Positions DB...');
  const positionsDbId = await tools.createDatabase(NOTION_PARENT_PAGE_ID, '📊 Positions', {
    position: { title: {} },
    chain: {
      select: {
        options: [
          { name: 'Cardano', color: 'blue' },
          { name: 'Ethereum', color: 'purple' },
        ],
      },
    },
    protocol: { rich_text: {} },
    wallet: { rich_text: {} },
    value_usd: { number: { format: 'dollar' } },
    health_factor: { number: { format: 'number' } },
    risk_level: {
      select: {
        options: [
          { name: '🟢 Safe', color: 'green' },
          { name: '🟡 Warning', color: 'yellow' },
          { name: '🔴 Danger', color: 'red' },
        ],
      },
    },
    last_updated: { date: {} },
  });
  if (!positionsDbId) throw new Error('Failed to create Positions DB');
  console.log(`  ✅ Positions DB: ${positionsDbId}`);

  // 5. 📋 Alert Log DB
  console.log('Creating 📋 Alert Log DB...');
  const alertLogDbId = await tools.createDatabase(NOTION_PARENT_PAGE_ID, '📋 Alert Log', {
    alert: { title: {} },
    chain: {
      select: {
        options: [
          { name: 'Cardano', color: 'blue' },
          { name: 'Ethereum', color: 'purple' },
        ],
      },
    },
    severity: {
      select: {
        options: [
          { name: 'Low', color: 'green' },
          { name: 'Medium', color: 'yellow' },
          { name: 'High', color: 'orange' },
          { name: 'Critical', color: 'red' },
        ],
      },
    },
    timestamp: { date: {} },
    details: { rich_text: {} },
  });
  if (!alertLogDbId) throw new Error('Failed to create Alert Log DB');
  console.log(`  ✅ Alert Log DB: ${alertLogDbId}`);

  // 6. 📝 Digests parent page
  console.log('Creating 📝 Digests page...');
  const digestsPageId = await tools.createPage(
    NOTION_PARENT_PAGE_ID,
    '📝 Digests',
    '> This page contains daily AI-generated portfolio digests from VaultRoom.\n',
  );
  if (!digestsPageId) throw new Error('Failed to create Digests page');
  console.log(`  ✅ Digests page: ${digestsPageId}`);

  // ─── Seed sample data ────────────────────────────────────────────────────

  console.log('\nSeeding sample data...');

  await tools.createPages([{
    parentDatabaseId: configDbId,
    properties: {
      name: { title: [{ text: { content: 'Demo Cardano Wallet' } }] },
      chain: { select: { name: 'Cardano' } },
      wallet_address: { rich_text: [{ text: { content: 'addr1demo000000000000000000000000000000000000000000000000' } }] },
      health_factor_threshold: { number: 1.2 },
      tvl_drop_pct: { number: 15 },
      polling_minutes: { number: 5 },
      active: { checkbox: true },
    },
  }]);
  console.log('  ✅ Sample Config entry added');

  await tools.createPages([{
    parentDatabaseId: watchlistDbId,
    properties: {
      protocol: { title: [{ text: { content: 'Minswap' } }] },
      chain: { select: { name: 'Cardano' } },
      contract_address: { rich_text: [{ text: { content: '' } }] },
      watch_type: { multi_select: [{ name: 'tvl' }, { name: 'yield' }] },
      active: { checkbox: true },
    },
  }]);
  console.log('  ✅ Sample Watchlist entry added (Minswap / Cardano)');

  // ─── Save IDs ────────────────────────────────────────────────────────────

  const ids = {
    NOTION_CONFIG_DB_ID: configDbId,
    NOTION_WATCHLIST_DB_ID: watchlistDbId,
    NOTION_RISK_DASHBOARD_DB_ID: riskDashboardDbId,
    NOTION_POSITIONS_DB_ID: positionsDbId,
    NOTION_ALERT_LOG_DB_ID: alertLogDbId,
    NOTION_DIGESTS_PAGE_ID: digestsPageId,
  };

  writeFileSync('.vaultroom-ids.json', JSON.stringify(ids, null, 2));
  console.log('\n✅ Saved .vaultroom-ids.json');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Add these to your .env file:\n');
  for (const [key, value] of Object.entries(ids)) {
    console.log(`${key}=${value}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔗 Notion URLs:');
  console.log(`  ⚙️  Config:         https://notion.so/${configDbId.replace(/-/g, '')}`);
  console.log(`  👁️  Watchlist:      https://notion.so/${watchlistDbId.replace(/-/g, '')}`);
  console.log(`  🚨 Risk Dashboard: https://notion.so/${riskDashboardDbId.replace(/-/g, '')}`);
  console.log(`  📊 Positions:      https://notion.so/${positionsDbId.replace(/-/g, '')}`);
  console.log(`  📋 Alert Log:      https://notion.so/${alertLogDbId.replace(/-/g, '')}`);
  console.log(`  📝 Digests:        https://notion.so/${digestsPageId.replace(/-/g, '')}`);
  console.log('\n🏦 VaultRoom workspace ready!\n');

  await mcp.close();
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
