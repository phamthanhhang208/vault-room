/**
 * VaultRoom — Setup Notion workspace + seed with realistic testnet data.
 * Uses the hosted Notion MCP server's SQL DDL interface.
 * 
 * Usage: npx tsx scripts/setup-and-seed.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFileSync, readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const MCP_URL = process.env.NOTION_MCP_URL || 'https://mcp.notion.com/mcp';
const TOKEN = process.env.MCP_ACCESS_TOKEN!;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID || '';

if (!TOKEN) {
  console.error('❌ Missing MCP_ACCESS_TOKEN — run pnpm run setup:auth');
  process.exit(1);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n🏦 VaultRoom — Workspace Setup + Seed Data\n');

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: 'vault-room', version: '0.1.0' });
  await client.connect(transport);
  console.log('✅ Connected to Notion MCP\n');

  // Create parent page if not provided
  let parentId = PARENT_PAGE_ID;
  if (!parentId) {
    console.log('Creating 🏦 VaultRoom parent page...');
    const pageResult = await client.callTool({
      name: 'notion-create-pages',
      arguments: {
        pages: [{
          properties: { title: '🏦 VaultRoom' },
          content: '> Multi-chain DeFi risk monitoring agent — powered by Notion MCP\n\nThis workspace contains all databases and pages managed by the VaultRoom agent.\n\n## Databases\n- ⚙️ Config — wallet monitoring settings\n- 👁️ Watchlist — protocols to track\n- 🚨 Risk Dashboard — detected risk events\n- 📊 Positions — current portfolio positions\n- 📋 Alert Log — historical alerts\n- 📝 Digests — daily AI-written reports',
          icon: '🏦'
        }]
      }
    });
    const parsed = JSON.parse((pageResult.content[0] as any).text);
    parentId = parsed.pages[0].id;
    console.log(`  ✅ Parent page: ${parentId}\n`);
    await sleep(300);
  }

  // ─── Create Databases ──────────────────────────────────────────────

  const dbs: Record<string, { pageId: string; dsId: string }> = {};

  // 1. Config DB
  console.log('Creating ⚙️ Config DB...');
  let r = await client.callTool({
    name: 'notion-create-database',
    arguments: {
      title: '⚙️ Config',
      parent: { page_id: parentId, type: 'page_id' },
      schema: `CREATE TABLE "config" (
        "Name" TITLE,
        "Chain" SELECT('Cardano', 'Ethereum'),
        "Wallet Address" RICH_TEXT,
        "Health Threshold" NUMBER,
        "TVL Drop %" NUMBER,
        "Poll Minutes" NUMBER,
        "Active" CHECKBOX
      )`
    }
  });
  dbs.config = extractIds(r);
  console.log(`  ✅ page=${dbs.config.pageId} ds=${dbs.config.dsId}`);
  await sleep(300);

  // 2. Watchlist DB
  console.log('Creating 👁️ Watchlist DB...');
  r = await client.callTool({
    name: 'notion-create-database',
    arguments: {
      title: '👁️ Watchlist',
      parent: { page_id: parentId, type: 'page_id' },
      schema: `CREATE TABLE "watchlist" (
        "Protocol" TITLE,
        "Chain" SELECT('Cardano', 'Ethereum'),
        "Contract" RICH_TEXT,
        "Watch Type" MULTI_SELECT('tvl', 'whale', 'health', 'yield'),
        "Active" CHECKBOX
      )`
    }
  });
  dbs.watchlist = extractIds(r);
  console.log(`  ✅ page=${dbs.watchlist.pageId} ds=${dbs.watchlist.dsId}`);
  await sleep(300);

  // 3. Risk Dashboard DB
  console.log('Creating 🚨 Risk Dashboard DB...');
  r = await client.callTool({
    name: 'notion-create-database',
    arguments: {
      title: '🚨 Risk Dashboard',
      parent: { page_id: parentId, type: 'page_id' },
      schema: `CREATE TABLE "risk_dashboard" (
        "Event" TITLE,
        "Chain" SELECT('Cardano', 'Ethereum'),
        "Protocol" RICH_TEXT,
        "Severity" SELECT('🟢 Low', '🟡 Medium', '🟠 High', '🔴 Critical'),
        "Detected At" DATE,
        "AI Analysis" RICH_TEXT,
        "Recommended Action" RICH_TEXT,
        "Status" SELECT('New', 'Acknowledged', 'Escalated', 'Approved', 'Resolved')
      )`
    }
  });
  dbs.riskDashboard = extractIds(r);
  console.log(`  ✅ page=${dbs.riskDashboard.pageId} ds=${dbs.riskDashboard.dsId}`);
  await sleep(300);

  // 4. Positions DB
  console.log('Creating 📊 Positions DB...');
  r = await client.callTool({
    name: 'notion-create-database',
    arguments: {
      title: '📊 Positions',
      parent: { page_id: parentId, type: 'page_id' },
      schema: `CREATE TABLE "positions" (
        "Position" TITLE,
        "Chain" SELECT('Cardano', 'Ethereum'),
        "Protocol" RICH_TEXT,
        "Wallet" RICH_TEXT,
        "Value USD" NUMBER,
        "Health Factor" NUMBER,
        "Risk Level" SELECT('🟢 Safe', '🟡 Warning', '🔴 Danger'),
        "Last Updated" DATE
      )`
    }
  });
  dbs.positions = extractIds(r);
  console.log(`  ✅ page=${dbs.positions.pageId} ds=${dbs.positions.dsId}`);
  await sleep(300);

  // 5. Alert Log DB
  console.log('Creating 📋 Alert Log DB...');
  r = await client.callTool({
    name: 'notion-create-database',
    arguments: {
      title: '📋 Alert Log',
      parent: { page_id: parentId, type: 'page_id' },
      schema: `CREATE TABLE "alert_log" (
        "Alert" TITLE,
        "Chain" SELECT('Cardano', 'Ethereum'),
        "Severity" SELECT('Low', 'Medium', 'High', 'Critical'),
        "Timestamp" DATE,
        "Details" RICH_TEXT
      )`
    }
  });
  dbs.alertLog = extractIds(r);
  console.log(`  ✅ page=${dbs.alertLog.pageId} ds=${dbs.alertLog.dsId}`);
  await sleep(300);

  // 6. Digests page
  console.log('Creating 📝 Digests page...');
  const digestResult = await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { page_id: parentId, type: 'page_id' },
      pages: [{
        properties: { title: '📝 Digests' },
        content: '> Daily AI-generated portfolio reports from VaultRoom.\n\nEach child page below is a daily digest summarizing portfolio health, risk events, and recommended actions.',
        icon: '📝'
      }]
    }
  });
  const digestParsed = JSON.parse((digestResult.content[0] as any).text);
  dbs.digests = digestParsed.pages[0].id;
  console.log(`  ✅ ${dbs.digests}`);
  await sleep(300);

  console.log('\n✅ All databases created!\n');

  // ─── Seed Data ─────────────────────────────────────────────────────

  console.log('═══ Seeding realistic testnet data ═══\n');
  const now = new Date().toISOString();
  const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

  // Config entries
  console.log('Seeding ⚙️ Config...');
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { data_source_id: dbs.config.dsId, type: 'data_source_id' },
      pages: [
        {
          properties: {
            "Name": "Cardano DeFi Wallet",
            "Chain": "Cardano",
            "Wallet Address": "addr_test1qr5vfnxhramaqapq7ykzscrsyrdfg4jfkg6pu2zt7af4qgm5ty5s4s7kfxqa8w9fjljxm3lzhkqjld0snpseqp467dqsmekv6",
            "Health Threshold": 1.2,
            "TVL Drop %": 15,
            "Poll Minutes": 5,
            "Active": true
          }
        },
        {
          properties: {
            "Name": "Ethereum Sepolia Wallet",
            "Chain": "Ethereum",
            "Wallet Address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            "Health Threshold": 1.15,
            "TVL Drop %": 20,
            "Poll Minutes": 10,
            "Active": true
          }
        }
      ]
    }
  });
  console.log('  ✅ 2 wallet configs');
  await sleep(300);

  // Watchlist entries
  console.log('Seeding 👁️ Watchlist...');
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { data_source_id: dbs.watchlist.dsId, type: 'data_source_id' },
      pages: [
        { properties: { "Protocol": "Minswap", "Chain": "Cardano", "Contract": "", "Watch Type": "tvl, yield", "Active": true } },
        { properties: { "Protocol": "SundaeSwap", "Chain": "Cardano", "Contract": "", "Watch Type": "tvl, whale", "Active": true } },
        { properties: { "Protocol": "Liqwid", "Chain": "Cardano", "Contract": "", "Watch Type": "health, tvl", "Active": true } },
        { properties: { "Protocol": "Aave v3", "Chain": "Ethereum", "Contract": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", "Watch Type": "health, tvl", "Active": true } },
        { properties: { "Protocol": "Uniswap v3", "Chain": "Ethereum", "Contract": "0x1F98431c8aD98523631AE4a59f267346ea31F984", "Watch Type": "whale, tvl", "Active": true } },
      ]
    }
  });
  console.log('  ✅ 5 protocols');
  await sleep(300);

  // Positions
  console.log('Seeding 📊 Positions...');
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { data_source_id: dbs.positions.dsId, type: 'data_source_id' },
      pages: [
        { properties: { "Position": "ADA Staking (Minswap Farm)", "Chain": "Cardano", "Protocol": "Minswap", "Wallet": "addr_test1qr5v...ekv6", "Value USD": 12450.00, "Health Factor": 0, "Risk Level": "🟢 Safe", "Last Updated": now } },
        { properties: { "Position": "ADA/MIN LP", "Chain": "Cardano", "Protocol": "Minswap", "Wallet": "addr_test1qr5v...ekv6", "Value USD": 8230.50, "Health Factor": 0, "Risk Level": "🟢 Safe", "Last Updated": now } },
        { properties: { "Position": "ADA Lending Supply", "Chain": "Cardano", "Protocol": "Liqwid", "Wallet": "addr_test1qr5v...ekv6", "Value USD": 15000.00, "Health Factor": 1.85, "Risk Level": "🟢 Safe", "Last Updated": now } },
        { properties: { "Position": "ADA/DJED Borrow", "Chain": "Cardano", "Protocol": "Liqwid", "Wallet": "addr_test1qr5v...ekv6", "Value USD": 5200.00, "Health Factor": 1.12, "Risk Level": "🟡 Warning", "Last Updated": now } },
        { properties: { "Position": "ETH Supply (Aave)", "Chain": "Ethereum", "Protocol": "Aave v3", "Wallet": "0xd8dA...6045", "Value USD": 45200.00, "Health Factor": 2.31, "Risk Level": "🟢 Safe", "Last Updated": now } },
        { properties: { "Position": "USDC Borrow (Aave)", "Chain": "Ethereum", "Protocol": "Aave v3", "Wallet": "0xd8dA...6045", "Value USD": 18500.00, "Health Factor": 1.08, "Risk Level": "🔴 Danger", "Last Updated": now } },
        { properties: { "Position": "ETH/USDC LP (Uniswap)", "Chain": "Ethereum", "Protocol": "Uniswap v3", "Wallet": "0xd8dA...6045", "Value USD": 22100.00, "Health Factor": 0, "Risk Level": "🟢 Safe", "Last Updated": now } },
      ]
    }
  });
  console.log('  ✅ 7 positions');
  await sleep(300);

  // Risk Dashboard events
  console.log('Seeding 🚨 Risk Dashboard...');
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { data_source_id: dbs.riskDashboard.dsId, type: 'data_source_id' },
      pages: [
        {
          properties: {
            "Event": "USDC Borrow health factor critically low",
            "Chain": "Ethereum", "Protocol": "Aave v3",
            "Severity": "🔴 Critical", "Detected At": ago(2),
            "AI Analysis": "Health factor at 1.08, approaching liquidation threshold of 1.0. The position has $18,500 USDC borrowed against $45,200 ETH collateral. A 5% ETH price drop would trigger partial liquidation. Immediate action recommended.",
            "Recommended Action": "Repay 20% of USDC borrow ($3,700) to raise health factor above 1.3, or add $5,000 ETH collateral.",
            "Status": "Escalated"
          },
          content: '## 🔴 Critical Risk Event\n\n**Position:** USDC Borrow on Aave v3\n**Health Factor:** 1.08 (threshold: 1.15)\n**Liquidation Risk:** HIGH\n\n### AI Analysis\nThe health factor has been declining over the past 6 hours as ETH price dropped 3.2%. At current trajectory, liquidation could occur within 12-18 hours if no action is taken.\n\n### Recommended Actions\n1. **Immediate:** Repay $3,700 USDC to raise HF to 1.3\n2. **Alternative:** Add $5,000 ETH collateral\n3. **Monitor:** Set 1-hour polling until HF > 1.5\n\n> ⚠️ Awaiting human approval before executing any action.'
        },
        {
          properties: {
            "Event": "ADA/DJED borrow approaching threshold",
            "Chain": "Cardano", "Protocol": "Liqwid",
            "Severity": "🟡 Medium", "Detected At": ago(5),
            "AI Analysis": "Health factor at 1.12, above the 1.2 threshold but trending downward. DJED depeg risk is low but ADA volatility could push this into warning territory within 24h.",
            "Recommended Action": "Monitor closely. Consider partial repayment if HF drops below 1.15.",
            "Status": "Acknowledged"
          }
        },
        {
          properties: {
            "Event": "Large withdrawal from Minswap TVL",
            "Chain": "Cardano", "Protocol": "Minswap",
            "Severity": "🟡 Medium", "Detected At": ago(8),
            "AI Analysis": "Minswap TVL dropped 12% in the last 4 hours. A single whale withdrew ~2.5M ADA from the ADA/MIN pool. Your LP position value may be affected by increased impermanent loss.",
            "Recommended Action": "No immediate action needed. Monitor for further withdrawals.",
            "Status": "Resolved"
          }
        },
        {
          properties: {
            "Event": "Unusual transaction pattern detected",
            "Chain": "Ethereum", "Protocol": "Uniswap v3",
            "Severity": "🟢 Low", "Detected At": ago(12),
            "AI Analysis": "3 rapid swaps detected in the ETH/USDC pool within 10 minutes, totaling $450K. This appears to be arbitrage activity and poses no direct risk to your LP position.",
            "Recommended Action": "Informational only. No action required.",
            "Status": "Resolved"
          }
        },
        {
          properties: {
            "Event": "Whale movement: 500K ADA transferred",
            "Chain": "Cardano", "Protocol": "SundaeSwap",
            "Severity": "🟠 High", "Detected At": ago(1),
            "AI Analysis": "A wallet transferred 500,000 ADA to SundaeSwap's liquidity pool contract. This represents ~8% of the pool's current TVL and could cause significant price impact on SUNDAE token.",
            "Recommended Action": "Review your SundaeSwap exposure. Consider reducing position if SUNDAE price drops > 10%.",
            "Status": "New"
          }
        },
      ]
    }
  });
  console.log('  ✅ 5 risk events');
  await sleep(300);

  // Alert Log
  console.log('Seeding 📋 Alert Log...');
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { data_source_id: dbs.alertLog.dsId, type: 'data_source_id' },
      pages: [
        { properties: { "Alert": "Health factor warning: USDC Borrow", "Chain": "Ethereum", "Severity": "Critical", "Timestamp": ago(2), "Details": "HF dropped to 1.08 on Aave v3 USDC borrow. Escalated for approval." } },
        { properties: { "Alert": "Health factor watch: ADA/DJED", "Chain": "Cardano", "Severity": "Medium", "Timestamp": ago(5), "Details": "HF at 1.12 on Liqwid ADA/DJED borrow. Approaching 1.2 threshold." } },
        { properties: { "Alert": "TVL drop: Minswap ADA/MIN pool", "Chain": "Cardano", "Severity": "Medium", "Timestamp": ago(8), "Details": "12% TVL decrease detected. Whale withdrawal of ~2.5M ADA." } },
        { properties: { "Alert": "Whale deposit: SundaeSwap", "Chain": "Cardano", "Severity": "High", "Timestamp": ago(1), "Details": "500K ADA deposited to SundaeSwap LP. ~8% of pool TVL." } },
        { properties: { "Alert": "Arbitrage activity: Uniswap ETH/USDC", "Chain": "Ethereum", "Severity": "Low", "Timestamp": ago(12), "Details": "3 rapid swaps totaling $450K. Arbitrage bot activity, no risk to LP." } },
        { properties: { "Alert": "Position snapshot updated", "Chain": "Cardano", "Severity": "Low", "Timestamp": ago(0.5), "Details": "All 4 Cardano positions refreshed. Total value: $40,880.50" } },
        { properties: { "Alert": "Position snapshot updated", "Chain": "Ethereum", "Severity": "Low", "Timestamp": ago(0.5), "Details": "All 3 Ethereum positions refreshed. Total value: $85,800.00" } },
      ]
    }
  });
  console.log('  ✅ 7 alerts');
  await sleep(300);

  // Daily Digest
  console.log('Seeding 📝 Digest...');
  const today = new Date().toISOString().split('T')[0];
  await client.callTool({
    name: 'notion-create-pages',
    arguments: {
      parent: { page_id: dbs.digests, type: 'page_id' },
      pages: [{
        properties: { title: `📊 Daily Digest — ${today}` },
        icon: '📊',
        content: `# Portfolio Summary — ${today}

## 💰 Total Portfolio Value: $126,680.50

| Chain | Positions | Value | Risk Status |
|-------|-----------|-------|-------------|
| Cardano | 4 | $40,880.50 | ⚠️ 1 Warning |
| Ethereum | 3 | $85,800.00 | 🔴 1 Critical |

---

## 🚨 Active Risk Events

### 🔴 CRITICAL: USDC Borrow on Aave v3
- **Health Factor:** 1.08 (threshold: 1.15)
- **Status:** Escalated — awaiting human approval
- **AI Recommendation:** Repay $3,700 USDC or add $5,000 ETH collateral
- **Time to liquidation:** ~12-18 hours at current trajectory

### 🟠 HIGH: Whale Movement on SundaeSwap
- 500K ADA deposited to LP pool (~8% of TVL)
- Monitoring for SUNDAE price impact

### 🟡 MEDIUM: ADA/DJED Borrow on Liqwid
- Health factor at 1.12, trending down
- No immediate action needed

---

## 📊 Position Details

### Cardano Positions
| Position | Protocol | Value | Health Factor | Risk |
|----------|----------|-------|---------------|------|
| ADA Staking (Farm) | Minswap | $12,450 | — | 🟢 Safe |
| ADA/MIN LP | Minswap | $8,230 | — | 🟢 Safe |
| ADA Lending Supply | Liqwid | $15,000 | 1.85 | 🟢 Safe |
| ADA/DJED Borrow | Liqwid | $5,200 | 1.12 | 🟡 Warning |

### Ethereum Positions
| Position | Protocol | Value | Health Factor | Risk |
|----------|----------|-------|---------------|------|
| ETH Supply | Aave v3 | $45,200 | 2.31 | 🟢 Safe |
| USDC Borrow | Aave v3 | $18,500 | 1.08 | 🔴 Danger |
| ETH/USDC LP | Uniswap v3 | $22,100 | — | 🟢 Safe |

---

## 🤖 AI Insights

> The portfolio is under moderate stress. The critical Aave v3 USDC borrow position requires immediate attention. The Cardano side is relatively stable but the Liqwid borrow should be monitored given ADA's recent volatility. The Minswap TVL drop has stabilized and the whale withdrawal appears to be an isolated event.

### Recommended Priority Actions
1. **Urgent:** Address Aave USDC borrow HF (within 6 hours)
2. **Today:** Review SundaeSwap exposure after whale deposit
3. **This week:** Consider reducing Liqwid borrow ratio

---

*Generated by VaultRoom AI Agent using Gemini 2.5 Pro · ${new Date().toLocaleString()}*`
      }]
    }
  });
  console.log('  ✅ Daily digest published');

  // ─── Save IDs ──────────────────────────────────────────────────────

  const ids = {
    NOTION_PARENT_PAGE_ID: parentId,
    NOTION_CONFIG_DB_ID: dbs.config.dsId,
    NOTION_WATCHLIST_DB_ID: dbs.watchlist.dsId,
    NOTION_RISK_DASHBOARD_DB_ID: dbs.riskDashboard.dsId,
    NOTION_POSITIONS_DB_ID: dbs.positions.dsId,
    NOTION_ALERT_LOG_DB_ID: dbs.alertLog.dsId,
    NOTION_DIGESTS_PAGE_ID: dbs.digests,
  };

  // Update .env
  let envContent = readFileSync('.env', 'utf-8');
  for (const [key, val] of Object.entries(ids)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${val}`);
    } else {
      envContent += `\n${key}=${val}`;
    }
  }
  writeFileSync('.env', envContent);

  writeFileSync('.vaultroom-ids.json', JSON.stringify(ids, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ VaultRoom workspace ready with sample data!\n');
  console.log('📋 Database IDs saved to .env and .vaultroom-ids.json\n');
  for (const [key, val] of Object.entries(ids)) {
    console.log(`  ${key}=${val}`);
  }
  console.log('\n🔗 Open in Notion:');
  console.log(`  https://notion.so/${parentId.replace(/-/g, '')}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await client.close();
  process.exit(0);
}

function extractIds(result: any): { pageId: string; dsId: string } {
  const raw = (result.content[0] as any).text;
  // The response is JSON-encoded, so parse it first
  let text: string;
  try {
    const parsed = JSON.parse(raw);
    text = typeof parsed === 'string' ? parsed : parsed.result || raw;
  } catch {
    text = raw;
  }
  // Extract database page ID from: notion.so/XXXXX
  const urlMatch = text.match(/notion\.so\/([a-f0-9]{32})/);
  // Extract collection/data_source ID from: collection://UUID
  const collMatch = text.match(/collection:\/\/([a-f0-9-]+)/);
  return {
    pageId: urlMatch ? urlMatch[1] : '',
    dsId: collMatch ? collMatch[1] : '',
  };
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
