# VaultRoom — Demo Video Script (~3 min)

## Before Recording
1. Refresh MCP token: `cd ~/Projects/vault-room && npx tsx scripts/mcp-auth.ts`
2. Open Notion to VaultRoom workspace
3. Open terminal, `cd ~/Projects/vault-room`, font size 18pt
4. Screen recorder ready (QuickTime Cmd+Shift+5 or OBS)

---

## SCENE 1 — Notion Workspace Tour [0:00 - 0:50]

**On screen:** Notion — 🏦 VaultRoom parent page

**Say:**
> "This is VaultRoom — a DeFi risk monitoring agent that uses Notion as its control plane. Everything you see here was created programmatically through Notion MCP."

**Action:** Scroll down slowly to show all 6 databases listed.

**Say:**
> "The workspace has 6 databases, each serving a different role."

**Action:** Click into ⚙️ Config database.

**Say:**
> "Config is where the human sets up monitoring. Wallet addresses, health factor thresholds, polling intervals. The agent reads this every cycle — change a number here, the agent adapts. No redeployment needed."

**Action:** Click back, then click into 👁️ Watchlist.

**Say:**
> "Watchlist tracks which DeFi protocols to monitor — Minswap, Liqwid, SundaeSwap. Each with specific risk types: TVL drops, whale movements, health checks."

**Action:** Click back, then click into 📊 Positions.

**Say:**
> "Positions shows the current portfolio. These are real balances from a Cardano Preprod testnet wallet — 31,000 ADA, Minswap LP tokens, Liqwid lending positions."

**Action:** Click back, then click into 🚨 Risk Dashboard.

**Say:**
> "Risk Dashboard is where the action happens. The agent writes risk events here with AI analysis and severity. And this is where the human-in-the-loop approval flow lives — but we'll see that in a moment."

**Action:** Click back, briefly show 📋 Alert Log and 📝 Digests.

**Say:**
> "Alert Log keeps a history of every alert. And Digests holds AI-written daily portfolio reports. Let's see the agent in action."

---

## SCENE 2 — Start the Demo [0:50 - 1:00]

**Action:** Cmd+Tab to terminal.

**Type and run:**
```
pnpm run demo
```

**Say:**
> "The agent connects to Notion's hosted MCP server via OAuth — the same server Claude and Cursor use."

*Wait for banner + MCP connection + tool list.*

---

## SCENE 3 — Config Read + On-Chain Data [1:00 - 1:20]

**On screen:** Terminal, Steps 2-3 scrolling

**Say:**
> "First it reads the config we just saw from Notion via MCP. Then it fetches live on-chain data — Cardano via Blockfrost, Ethereum via ethers. Real testnet balances, real transactions."

*Let wallet balances scroll by.*

---

## SCENE 4 — Positions + Risk Detection [1:20 - 1:40]

**On screen:** Terminal, Steps 4-5 (positions table + risk signals)

**Say:**
> "DeFi positions loaded. The risk engine runs — rule-based checks for health factor drops, whale movements, balance anomalies. And there it is — health factor 0.98. Below 1.0 means liquidation is imminent. Critical."

*Pause briefly on the red critical alert.*

---

## SCENE 5 — AI Analysis + Write to Notion [1:40 - 2:05]

**On screen:** Terminal, Step 6 (Gemini output + MCP writes)

**Say:**
> "Gemini 2.5 Pro analyzes the signal — plain English risk assessment with a recommended action. The agent writes it to Notion's Risk Dashboard through MCP."

**Action:** Cmd+Tab to Notion → 🚨 Risk Dashboard

**Say:**
> "Here it is. New critical event, AI analysis, recommended action. Status: Escalated — the agent is waiting for human approval."

*Click into the new escalated event to show the AI analysis and content.*

**Action:** Cmd+Tab back to terminal.

---

## SCENE 6 — Human Approval ⭐ [2:05 - 2:35]

**On screen:** Terminal showing "⏳ Waiting for human approval..." ticking

**Say:**
> "The agent polls Notion every 5 seconds via MCP, watching for a status change. This is the bidirectional part — data flows both ways."

**Action:** Cmd+Tab to Notion.

**Say:**
> "I'll approve it."

**On screen:** Click the Status dropdown on the escalated event → select "Approved"

**Action:** Cmd+Tab back to terminal. Wait for it to detect.

**On screen:** Terminal shows ✅ Human approved + resolved + comment left

**Say:**
> "Picked it up. Resolved the event. Left a comment in Notion. Human and AI, coordinating through Notion — no webhooks, no external system."

---

## SCENE 7 — Daily Digest [2:35 - 2:50]

**On screen:** Terminal, Step 8 (digest generation)

**Say:**
> "Finally, a daily portfolio digest. Gemini writes the briefing, the agent publishes it as a rich Notion page through MCP."

**Action:** Cmd+Tab to Notion → 📝 Digests → click today's digest

**Say:**
> "Tables, callouts, toggles — all from one Markdown string. One MCP call."

*Scroll through the digest page briefly.*

---

## SCENE 8 — Close [2:50 - 3:00]

**Action:** Cmd+Tab back to terminal, showing summary box

**Say:**
> "That's VaultRoom. Real blockchain data, AI risk analysis, human-in-the-loop approval — all through Notion MCP. Notion isn't a dashboard. It's the control plane."

*End recording.*

---

## All Lines (cheat sheet)

1. "This is VaultRoom — a DeFi risk agent that uses Notion as its control plane. Everything here was created through Notion MCP."
2. "Config is where the human sets up monitoring. Change a number here, the agent adapts."
3. "Watchlist tracks which protocols to monitor — each with specific risk types."
4. "Positions shows real balances from a Cardano Preprod testnet wallet."
5. "Risk Dashboard is where the human-in-the-loop approval flow lives."
6. "Alert Log keeps history. Digests hold AI-written daily reports. Let's see the agent."
7. "The agent connects to Notion's hosted MCP server via OAuth."
8. "It reads config from Notion via MCP, then fetches live on-chain data."
9. "Health factor 0.98. Below 1.0. Liquidation imminent. Critical."
10. "Gemini analyzes it. The agent writes it to Notion's Risk Dashboard through MCP."
11. "Here it is. Escalated — waiting for human approval."
12. "The agent polls Notion every 5 seconds. This is the bidirectional part."
13. "I'll approve it." *(click)*
14. "Picked it up. Resolved. Comment left. Human and AI through Notion."
15. "Daily digest. Tables, callouts, toggles — one Markdown string, one MCP call."
16. "That's VaultRoom. Notion isn't a dashboard. It's the control plane."

---

## If Things Go Wrong

- **MCP token expired:** Demo fails at Step 1. Re-run auth and retry.
- **Approval timeout (5 min):** Cut the wait in post-editing.
- **On-chain fetch fails:** Demo falls back to demo data. Keep going.
- **New event doesn't appear in Notion:** Refresh the Risk Dashboard page (Cmd+R).
