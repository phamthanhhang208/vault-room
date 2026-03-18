# CLAUDE.md — VaultRoom

## Project Overview

VaultRoom is a multi-chain DeFi risk monitoring agent that uses Notion as a
bidirectional control plane. Built for the **Notion MCP Challenge** (deadline:
March 29, 2026). Solo developer project.

The agent monitors on-chain positions across Cardano and Ethereum, detects risk
anomalies using rule-based checks + Gemini 2.5 Pro analysis, and manages a
living Notion workspace where human operators configure thresholds, approve
escalations, and receive AI-written daily digests.

**CRITICAL: All Notion interactions go through the remote Notion MCP server
(`https://mcp.notion.com/mcp`) via OAuth. We do NOT use `@notionhq/client`
SDK directly. Our agent is an MCP client using `@modelcontextprotocol/sdk`.**

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode)
- **Package manager:** pnpm
- **MCP Client:** @modelcontextprotocol/sdk (connects to remote Notion MCP)
- **Notion MCP Server:** Remote hosted (`https://mcp.notion.com/mcp`), OAuth auth
- **Blockchain:** @blockfrost/blockfrost-js (Cardano), ethers v6 (Ethereum)
- **LLM:** @google/generative-ai (Gemini 2.5 Pro) — risk analysis + digest generation
- **Scheduler:** node-cron
- **Validation:** zod
- **Logging:** winston

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Notion Workspace                       │
│                                                          │
│  ⚙️ Config DB ──────┐      ┌──── 🚨 Risk Dashboard DB   │
│  👁️ Watchlist DB ────┤      │ ──── 📊 Positions DB       │
│  (human → agent)     │      │ ──── 📋 Alert Log DB       │
│  Status: "Approved" ─┘      └── ── 📝 Digest Pages       │
└──────────────┬──────────────────────┬────────────────────┘
               │    Notion REST API   │
               ▼                      ▲
┌──────────────────────────────────────────────────────────┐
│           Notion MCP Server (remote, hosted by Notion)    │
│           https://mcp.notion.com/mcp                      │
│           Auth: OAuth 2.0 + PKCE                          │
│                                                           │
│  Tools: notion-search, notion-fetch, notion-create-pages, │
│         notion-update-page, notion-create-database,       │
│         notion-create-comment, notion-query-database-view │
└──────────────┬──────────────────────┬────────────────────┘
               │   MCP Protocol       │
               │  (Streamable HTTP)   │
               ▼                      ▲
        ┌──────────────────────────────────┐
        │         VaultRoom Agent           │
        │         (MCP Client)              │
        │                                   │
        │  src/mcp/client.ts  ← MCP conn   │
        │  src/mcp/tools.ts   ← typed wraps│
        │  src/notion/reader  ← reads config│
        │  src/notion/writer  ← writes data │
        │  src/notion/digest  ← rich pages  │
        │                                   │
        │  ┌─────────────┐  ┌────────────┐ │
        │  │ Risk Engine  │  │  Gemini    │ │
        │  │ (rule-based) │──│  2.5 Pro   │ │
        │  └──────┬───────┘  └────────────┘ │
        │  ┌──────┴───────┐                 │
        │  │Chain Adapters │                 │
        │  │ ├─ Cardano    │                 │
        │  │ └─ Ethereum   │                 │
        │  └───────────────┘                 │
        └──────────────────────────────────┘
               │                │
               ▼                ▼
        Blockfrost API    Ethereum RPC
```

## MCP Integration Details

### Connection
- Remote hosted Notion MCP: `https://mcp.notion.com/mcp`
- Auth: OAuth 2.0 with PKCE
- Transport: Streamable HTTP
- Access tokens expire after 1 hour — handle refresh
- Refresh token rotation: keep latest token, invalidate old

### MCP Tools Used (6 tools)

| Tool | Direction | VaultRoom Usage |
|------|-----------|-----------------|
| `notion-search` | Read | Find databases, locate existing positions for upsert |
| `notion-fetch` | Read | Read Config DB, Watchlist, poll escalation approvals |
| `notion-create-pages` | Write | Risk events, positions, alerts, daily digests |
| `notion-update-page` | Write | Update positions, resolve escalations |
| `notion-create-database` | Write | Initial workspace setup (Phase 0) |
| `notion-create-comment` | Write | Agent comments on escalated items |

### Page Content Format
- Uses **Notion-flavored Markdown** (not JSON block arrays)
- MCP server converts Markdown → Notion blocks automatically
- `>` blockquote → Notion callout
- `<details>` → Notion toggle
- Standard Markdown tables → Notion tables
- Standard lists, headings, bold/italic → corresponding blocks

### Rate Limits
- 180 requests/minute general (3/sec)
- 30 searches/minute for `notion-search`
- Agent adds 200ms delay between consecutive MCP calls
- Batches page creates where possible (notion-create-pages accepts arrays)

## Notion Workspace — 6 Databases

### Human → Agent (agent reads via MCP)
1. **⚙️ Config** — wallet addresses, alert thresholds, polling intervals
2. **👁️ Watchlist** — protocols and watch types to monitor

### Agent → Human (agent writes via MCP)
3. **🚨 Risk Dashboard** — risk events with AI analysis, escalation status (bidirectional)
4. **📊 Positions** — live position tracking with health metrics (upserted)
5. **📋 Alert Log** — append-only alert history
6. **📝 Digests** — AI-written daily portfolio briefings as rich Notion pages

## Key Data Flow

### Monitor Cycle
1. Read Config + Watchlist from Notion via `notion-fetch`
2. Fetch on-chain data via chain adapters (Blockfrost, ethers)
3. Run risk engine (rule-based threshold checks)
4. For high/critical signals → Gemini analysis
5. Write signals to Notion via `notion-create-pages`
6. Upsert positions via `notion-search` + `notion-update-page` / `notion-create-pages`
7. Poll escalations via `notion-fetch` on Risk Dashboard
8. If human approved → `notion-update-page` (Resolved) + `notion-create-comment`

### Escalation Flow (the MCP showcase)
1. Critical signal detected → `notion-create-pages` with status "Escalated"
2. Agent polls via `notion-fetch` for status = "Approved"
3. Human changes status in Notion UI
4. Agent detects → `notion-update-page` to "Resolved"
5. Agent leaves `notion-create-comment` acknowledging resolution

## Directory Structure

```
vaultroom/
├── src/
│   ├── index.ts              # Entry point, MCP connect, scheduler
│   ├── config.ts             # Zod-validated env vars
│   ├── types.ts              # Shared types
│   ├── mcp/
│   │   ├── client.ts         # MCP client — connects to remote Notion MCP
│   │   └── tools.ts          # Typed wrappers around MCP tool calls + rate limiting
│   ├── chains/
│   │   ├── types.ts          # ChainAdapter interface
│   │   ├── cardano.ts        # Blockfrost adapter
│   │   └── ethereum.ts       # Ethers.js adapter
│   ├── risk/
│   │   ├── engine.ts         # RiskEngine class
│   │   ├── signals.ts        # RiskSignal types
│   │   └── prompts.ts        # Gemini prompt templates
│   ├── notion/
│   │   ├── reader.ts         # Read config, watchlist, poll escalations (via MCP)
│   │   ├── writer.ts         # Write risk events, positions, alerts (via MCP)
│   │   └── digest.ts         # Rich digest page builder (Notion-flavored Markdown)
│   └── utils/
│       ├── logger.ts         # Winston structured logger
│       ├── retry.ts          # Exponential backoff
│       └── demo-data.ts      # Mock positions for demo
├── scripts/
│   ├── setup-notion.ts       # Creates Notion DBs via MCP
│   └── demo.ts               # Scripted demo (~2 min)
├── docs/plan/                # Phase prompts
├── .env.example
├── CLAUDE.md                 # This file
└── README.md
```

## CLI Commands

```bash
pnpm dev          # Start scheduler (continuous monitoring)
pnpm run cycle    # Run one monitor cycle and exit
pnpm run digest   # Generate today's digest and exit
pnpm run setup    # Create Notion workspace via MCP
pnpm run demo     # Run scripted demo scenario (~2 min)
```

## Environment Variables

```bash
# MCP / Notion OAuth
NOTION_MCP_URL=https://mcp.notion.com/mcp
NOTION_OAUTH_CLIENT_ID=
NOTION_OAUTH_CLIENT_SECRET=
NOTION_OAUTH_REDIRECT_URI=
NOTION_ACCESS_TOKEN=          # Or managed by OAuth flow
NOTION_REFRESH_TOKEN=

# Notion DB IDs (populated by setup script)
NOTION_CONFIG_DB_ID=
NOTION_WATCHLIST_DB_ID=
NOTION_RISK_DASHBOARD_DB_ID=
NOTION_POSITIONS_DB_ID=
NOTION_ALERT_LOG_DB_ID=
NOTION_DIGESTS_PAGE_ID=

# Blockchain
BLOCKFROST_API_KEY=
BLOCKFROST_NETWORK=mainnet
ETH_RPC_URL=https://eth.llamarpc.com

# AI
GEMINI_API_KEY=
```

## Coding Conventions

- TypeScript strict mode, no `any` — use `unknown` + zod parsing
- **ZERO imports from @notionhq/client** — all Notion via MCP
- All MCP calls go through src/mcp/tools.ts with rate limiting
- MCP tool calls logged with `[MCP]` prefix for demo visibility
- Page content as Notion-flavored Markdown, never JSON blocks
- Structured logging via winston — no raw console.log
- Zod validation on all external data
- DB property names never hardcoded — use constants
- Chain adapters implement ChainAdapter interface
- Gemini prompts request JSON, parsed with zod
- Error messages actionable ("Missing BLOCKFROST_API_KEY — get one at blockfrost.io")

## Competition Context

- **Challenge:** Notion MCP Challenge (3x $500 prizes for top 3)
- **Differentiator:** Only DeFi submission. Real blockchain domain expertise.
- **MCP depth:** 6 MCP tools, bidirectional data flow, agent comments on pages
- **Goal:** Top-3 finish
- **Pitch:** "Notion as a DeFi risk control plane — MCP is the protocol layer."
