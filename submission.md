*This is a submission for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)*

## What I Built

<!-- TODO: Add cover image — screenshot of Notion workspace with all 6 DBs visible -->

DeFi operators managing lending positions across multiple blockchains face a familiar problem: alerts scattered across Discord bots, risk tracking in spreadsheets, and critical decisions made via Telegram messages. There's no single source of truth, no structured escalation workflow, and no clean way for a human to stay in the loop when an AI agent flags something dangerous.

**VaultRoom** is a multi-chain DeFi risk monitoring agent that turns Notion into a **bidirectional control plane**. The agent monitors on-chain positions across Cardano and Ethereum, detects anomalies using rule-based checks and Gemini 2.5 Pro analysis, and manages a living Notion workspace — where human operators set thresholds, approve escalations, and receive AI-written daily digests.

Every single Notion interaction flows through the **remote Notion MCP server** via OAuth. Zero `@notionhq/client` SDK usage. MCP is the protocol layer between the agent and Notion.

**The key idea: Notion isn't a dashboard. It's the control plane. Data flows both ways.**

### What the agent does:

- Polls **Cardano** (Blockfrost) and **Ethereum** (ethers.js) for wallet balances and transactions
- Detects risk signals: health factor drops, whale movements, balance anomalies
- Calls **Gemini 2.5 Pro** to analyze critical signals and generate plain-English risk assessments
- Writes risk events, position updates, and alerts to Notion databases via MCP
- **Escalates critical alerts** and waits for human approval in Notion before resolving
- Leaves **comments** on Notion pages to acknowledge human decisions
- Generates rich **daily digest pages** with tables, callouts, and toggles — all via Notion-flavored Markdown through MCP

### What the human does (in Notion):

- Configures which wallets to monitor and sets alert thresholds
- Adds protocols to a watchlist
- Reviews AI-generated risk analysis
- Approves or rejects escalated alerts by changing a status field
- Reads daily portfolio digests

<!-- TODO: Add 2-3 screenshots:
1. Risk Dashboard DB showing a critical event with AI analysis
2. The escalation flow: Escalated → Approved → Resolved with agent comment
3. A daily digest page with tables and recommendations
-->

## Video Demo

<!-- TODO: Record and embed a 2-minute demo video -->

## Show us the code

{% github phamthanhhang208/vault-room %}

## How I Used Notion MCP

This is where I went deep. VaultRoom connects to Notion's **remote hosted MCP server** (`https://mcp.notion.com/mcp`) via OAuth 2.0 with PKCE and uses **7 MCP tools** as its core integration:

| MCP Tool | Direction | How VaultRoom Uses It |
|----------|-----------|----------------------|
| `notion-search` | Read | Finds databases by name, locates existing position pages for upsert logic |
| `notion-fetch` | Read | Reads Config DB to get thresholds, reads Watchlist, polls Risk Dashboard for human approvals |
| `notion-create-pages` | Write | Creates risk events, position entries, alert log items, and daily digest pages |
| `notion-update-page` | Write | Updates position data on re-scan, resolves escalated events after human approval |
| `notion-create-database` | Write | Scaffolds the entire 6-database Notion workspace using SQL DDL syntax |
| `notion-create-comment` | Write | Agent leaves acknowledgment comments on escalated items after human approves |
| `notion-get-comments` | Read | Reads discussion threads on escalated risk events |

### The Bidirectional Loop

Most MCP integrations I've seen are one-directional — an agent writes to Notion. VaultRoom goes both ways:

**Human → Agent** (Notion → MCP → VaultRoom):

The agent reads the Config and Watchlist databases every monitoring cycle. If a human changes a health factor threshold from 1.2 to 1.5 in the Notion UI, the agent picks it up on the next cycle and adjusts its detection sensitivity. No redeployment, no config files — the human edits Notion, the agent adapts.

**Agent → Human** (VaultRoom → MCP → Notion):

Risk events, positions, and alerts are written to structured databases. But the key showcase is the escalation flow:

![Escalation Flow](https://raw.githubusercontent.com/phamthanhhang208/vault-room/main/docs/images/escalation-flow.png)

1. Risk engine detects a critical signal (e.g., health factor drops below 1.0)
2. Agent creates a Risk Dashboard entry via `notion-create-pages` with status set to "Escalated"
3. Agent polls the dashboard via `notion-search` every cycle, waiting for status change
4. Human reviews the AI analysis in Notion and changes status to "Approved"
5. Agent detects the change, updates status to "Resolved" via `notion-update-page`
6. Agent leaves a comment on the page via `notion-create-comment`: *"✅ VaultRoom agent acknowledged approval. Escalation resolved."*

That last step — the agent commenting on a Notion page — is what makes this feel like a real conversation between the AI and the human, all inside Notion.

### Notion-Flavored Markdown for Rich Pages

The daily digest is the visual payoff. Instead of constructing JSON block arrays, the agent writes Notion-flavored Markdown through MCP. The server converts it to rich Notion blocks automatically:

- `>` blockquotes become **callouts** with portfolio snapshots
- Standard Markdown tables become **Notion tables** with position data
- `<details>` tags become **toggles** containing the full Gemini analysis
- Numbered lists become recommendation items

One MCP call, one Markdown string, and Notion renders a professional portfolio briefing with callouts, tables, and expandable sections. This is significantly cleaner than building block trees through the REST API.

### Monitor Cycle Data Flow

Each monitoring cycle follows a four-phase pattern — reading config from Notion, fetching on-chain data, detecting risks, and writing results back:

![Data Flow](https://raw.githubusercontent.com/phamthanhhang208/vault-room/main/docs/images/data-flow.png)

### Architecture

![Architecture](https://raw.githubusercontent.com/phamthanhhang208/vault-room/main/docs/images/architecture.png)

### Notion Database Schema

VaultRoom manages 6 interconnected databases, all created programmatically via MCP using SQL DDL syntax:

![Er Diagram](https://raw.githubusercontent.com/phamthanhhang208/vault-room/main/docs/images/er-diagram.png)

### Why DeFi + Notion MCP?

I build DeFi products professionally — lending protocols and yield platforms on Cardano. The risk scenarios in VaultRoom aren't hypothetical. Health factor monitoring, whale movement detection, and liquidation risk assessment are problems I deal with daily.

No other submission in this challenge touches DeFi. VaultRoom brings genuine domain expertise to a real problem, and Notion MCP turns out to be a surprisingly natural fit for operational risk management: structured databases for tracking, rich pages for reporting, comments for human-agent communication, and the whole thing accessible from a phone without building a custom UI.

### Lessons Learned: Hosted MCP Quirks

Building a custom MCP client against the hosted Notion MCP server taught me things the docs don't mention:

1. **The hosted MCP has its own OAuth** — You can't use a Notion REST API token. The MCP server uses PKCE with dynamic client registration. I implemented the full RFC 9470 → RFC 8414 discovery flow.

2. **SQL DDL for database creation** — `CREATE TABLE` syntax with custom types: `TITLE`, `RICH_TEXT`, `SELECT('opt1', 'opt2')`, `MULTI_SELECT`, `CHECKBOX`. Not the JSON schema from the REST API.

3. **Property values are SQLite-flavored** — Checkboxes are `"__YES__"` / `"__NO__"` (not booleans). Dates need expanded keys like `"date:Field Name:start"`. Multi-selects are JSON array strings.

4. **Pages in databases use `data_source_id`** — When creating rows, you reference the `collection://` ID, not the database page ID.

5. **Notion-flavored Markdown just works** — Blockquotes → callouts, tables → rich Notion tables, `<details>` → toggles. One string, one MCP call, beautiful output.

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript (strict) |
| MCP Client | `@modelcontextprotocol/sdk` (Streamable HTTP) |
| Notion MCP | Remote hosted `mcp.notion.com` (OAuth 2.0 PKCE) |
| Cardano | `@blockfrost/blockfrost-js` (Preprod testnet) |
| Ethereum | `ethers` v6 (Sepolia testnet) |
| AI | `@google/generative-ai` (Gemini 2.5 Pro) |
| Scheduler | `node-cron` |
| Validation | `zod` |
| Logging | `winston` |

---

<!-- Thanks for reading! If you work in DeFi or have questions about the MCP integration, drop a comment — I'd love to chat. -->

*Built solo for the Notion MCP Challenge · March 2026*
