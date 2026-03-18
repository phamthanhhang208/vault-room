# VaultRoom — Phase 0: Project Scaffold + Notion Setup

> **Time estimate:** ~1 day
> **Priority:** HIGHEST — this is the demo foundation
> **Depends on:** Nothing (start here)

## What we're building

VaultRoom is a multi-chain DeFi risk agent that monitors on-chain positions,
detects anomalies, and manages a living Notion workspace as a bidirectional
control plane. Notion is where human operators set thresholds, approve
escalations, and receive AI-written digests.

## Tech stack

- Node.js + TypeScript (strict mode)
- pnpm as package manager
- Single package, src/ directory (NOT a monorepo)

## Dependencies to install

```bash
pnpm add @notionhq/client @blockfrost/blockfrost-js ethers@6 \
  @google/generative-ai node-cron dotenv zod winston uuid

pnpm add -D typescript tsx @types/node @types/uuid
```

## Directory structure — create all files with stub exports

```
vaultroom/
├── src/
│   ├── index.ts                 # Entry point — "VaultRoom starting..." log
│   ├── config.ts                # Zod-validated env vars
│   ├── types.ts                 # Shared types (MonitorConfig, Position, etc.)
│   ├── chains/
│   │   ├── types.ts             # ChainAdapter interface
│   │   ├── cardano.ts           # Blockfrost adapter (stub)
│   │   └── ethereum.ts          # Ethers adapter (stub)
│   ├── risk/
│   │   ├── engine.ts            # Risk detection orchestrator (stub)
│   │   ├── signals.ts           # RiskSignal, Severity types
│   │   └── prompts.ts           # Gemini prompt templates (stub)
│   ├── notion/
│   │   ├── client.ts            # Notion SDK wrapper + helpers
│   │   ├── writer.ts            # Write to Risk Dashboard, Positions, Alerts
│   │   ├── reader.ts            # Read Config, Watchlist, Approvals
│   │   ├── schemas.ts           # DB property schemas as constants
│   │   └── digest.ts            # Rich digest page builder
│   └── utils/
│       ├── logger.ts            # Winston structured logger
│       ├── retry.ts             # Exponential backoff wrapper
│       └── demo-data.ts         # Mock positions for demo (stub)
├── scripts/
│   └── setup-notion.ts          # Creates all Notion DBs programmatically
├── docs/
│   └── plan/                    # Phase prompts (you're reading one)
├── .env.example
├── tsconfig.json
├── package.json
├── CLAUDE.md
└── README.md
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## package.json scripts

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "cycle": "tsx src/index.ts --once",
    "digest": "tsx src/index.ts --digest",
    "setup": "tsx scripts/setup-notion.ts",
    "demo": "tsx scripts/demo.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

## Notion setup script (scripts/setup-notion.ts) — THIS IS CRITICAL

This script programmatically creates the entire Notion workspace.
It accepts a `NOTION_PARENT_PAGE_ID` env var (user provides a blank page)
and creates everything underneath it.

### Databases to create:

**1. ⚙️ Config** (human → agent)

| Property | Type | Details |
|----------|------|---------|
| name | title | Label for this config entry |
| chain | select | Options: Cardano, Ethereum |
| wallet_address | rich_text | |
| health_factor_threshold | number | Default: 1.2 |
| tvl_drop_pct | number | Default: 15 |
| polling_minutes | number | Default: 5 |
| active | checkbox | Default: true |

**2. 👁️ Watchlist** (human → agent)

| Property | Type | Details |
|----------|------|---------|
| protocol | title | Protocol name |
| chain | select | Options: Cardano, Ethereum |
| contract_address | rich_text | |
| watch_type | multi_select | Options: tvl, whale, health, yield |
| active | checkbox | Default: true |

**3. 🚨 Risk Dashboard** (agent → human, bidirectional for escalations)

| Property | Type | Details |
|----------|------|---------|
| event | title | Event description |
| chain | select | Options: Cardano, Ethereum |
| protocol | rich_text | |
| severity | select | Options: 🟢 Low, 🟡 Medium, 🟠 High, 🔴 Critical |
| detected_at | date | |
| ai_analysis | rich_text | Gemini-generated analysis |
| recommended_action | rich_text | |
| status | select | Options: New, Acknowledged, Escalated, Approved, Resolved |

**4. 📊 Positions** (agent → human)

| Property | Type | Details |
|----------|------|---------|
| position | title | Position label |
| chain | select | Options: Cardano, Ethereum |
| protocol | rich_text | |
| wallet | rich_text | |
| value_usd | number | Format: dollar |
| health_factor | number | |
| risk_level | select | Options: 🟢 Safe, 🟡 Warning, 🔴 Danger |
| last_updated | date | |

**5. 📋 Alert Log** (agent → human)

| Property | Type | Details |
|----------|------|---------|
| alert | title | Alert description |
| chain | select | Options: Cardano, Ethereum |
| severity | select | Options: Low, Medium, High, Critical |
| timestamp | date | |
| details | rich_text | |

**6. 📝 Digests** — Create as a parent PAGE (not a DB). Daily digest pages become child pages under this.

### After creating all DBs:

1. Print all database IDs in a formatted block the user can copy-paste into `.env`
2. Store IDs in a local `.vaultroom-ids.json` cache file for programmatic access
3. Add a sample row to Config DB with a demo Cardano wallet address
4. Add a sample row to Watchlist with "Minswap" on Cardano
5. Log success with direct Notion URLs to each created DB

## config.ts — Zod schema

Validate all env vars at startup with clear, actionable error messages:

```typescript
// Required:
// NOTION_API_KEY — get one at https://www.notion.so/my-integrations
// NOTION_PARENT_PAGE_ID — create a blank page, copy its ID from the URL
// BLOCKFROST_API_KEY — get one at https://blockfrost.io
// GEMINI_API_KEY — get one at https://aistudio.google.com

// Optional with defaults:
// BLOCKFROST_NETWORK — default: "mainnet"
// ETH_RPC_URL — default: "https://eth.llamarpc.com"

// DB IDs (populated by setup script or manually):
// NOTION_CONFIG_DB_ID
// NOTION_WATCHLIST_DB_ID
// NOTION_RISK_DASHBOARD_DB_ID
// NOTION_POSITIONS_DB_ID
// NOTION_ALERT_LOG_DB_ID
// NOTION_DIGESTS_PAGE_ID
```

If a required var is missing, fail immediately with: `"Missing {VAR} — {how to get it}"`

## utils/logger.ts

Winston logger with:
- Colorized console output
- Timestamp prefix
- Log levels: error, warn, info, debug
- Format: `[HH:mm:ss] [LEVEL] message`

## utils/retry.ts

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number; label?: string }
): Promise<T>
```

- Default 3 attempts, 1s base delay, exponential backoff
- Log each retry attempt with the label
- Throw original error after all attempts exhausted

## .env.example

List ALL env vars with comments explaining each one and where to get the value.

## README.md — initial version

Start with:
- `# 🏦 VaultRoom` + one-line description
- `> Built for the Notion MCP Challenge`
- Quick start: `pnpm install` → `pnpm run setup` → `pnpm run demo`
- Placeholder sections: Architecture, Features, Demo, Screenshots

## Acceptance criteria

- [ ] `pnpm install` succeeds with no errors
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run setup` creates all 6 Notion DBs under the parent page
- [ ] Setup script prints DB IDs ready to paste into .env
- [ ] `.vaultroom-ids.json` is written with all IDs
- [ ] Sample config + watchlist rows appear in Notion
- [ ] `pnpm dev` starts and logs "VaultRoom starting..." then exits cleanly
- [ ] All stub files export their expected interfaces/types
