# VaultRoom — Demo Video Script (~2 min)

## Before Recording
1. Refresh MCP token: `cd ~/Projects/vault-room && npx tsx scripts/mcp-auth.ts`
2. Open Notion to VaultRoom workspace: https://notion.so/32e8bb9ec5168176a899fe5d7b0d4590
3. Open terminal, `cd ~/Projects/vault-room`, font size 18pt
4. Screen recorder ready (QuickTime Cmd+Shift+5 or OBS)
5. Layout: terminal full screen. You'll Cmd+Tab to Notion when needed.

---

## SCENE 1 — Intro + Start [0:00 - 0:10]

**On screen:** Terminal, cursor ready

**Type and run:**
```
pnpm run demo
```

**Say:**
> "This is VaultRoom — a DeFi risk agent that uses Notion as its control plane through MCP."

*Wait for banner + MCP connection + tool list to appear.*

---

## SCENE 2 — On-Chain Data [0:10 - 0:25]

**On screen:** Terminal, Steps 2-3 scrolling (config read + on-chain fetch)

**Say:**
> "The agent reads wallet config from Notion, then fetches live on-chain data — Cardano via Blockfrost, Ethereum via ethers. Real testnet balances."

*Let the wallet balances and token amounts scroll by.*

---

## SCENE 3 — Positions + Risk [0:25 - 0:45]

**On screen:** Terminal, Steps 4-5 (positions table + risk signals)

**Say:**
> "It loads DeFi positions and runs the risk engine. Here — health factor 0.98. That's below 1.0. Liquidation is imminent. The engine flags it as critical."

*Point out or pause on the red critical alert line.*

---

## SCENE 4 — AI Analysis + Notion [0:45 - 1:05]

**On screen:** Terminal, Step 6 (Gemini analysis + MCP writes)

**Say:**
> "Gemini analyzes the signal and writes a plain-English risk assessment. The agent creates the event in Notion's Risk Dashboard — through MCP, not the REST API."

**Then Cmd+Tab to Notion.**

**On screen:** Notion — 🚨 Risk Dashboard database

**Say:**
> "Here it is in Notion. Critical severity, AI analysis, recommended action. Status is 'Escalated' — waiting for human approval."

*Click into the risk event to show the AI analysis text and the "Escalated" status.*

*Cmd+Tab back to terminal.*

---

## SCENE 5 — Human Approval [1:05 - 1:35] ⭐

**On screen:** Terminal showing "Polling for approval..." with the timer

**Say:**
> "Now the agent polls Notion every 5 seconds, waiting for a human to approve. This is the bidirectional part."

**Cmd+Tab to Notion.**

**Say:**
> "I'll approve it now."

**On screen:** Click the Status dropdown on the escalated event → change "Escalated" to "Approved"

**Cmd+Tab back to terminal.**

**On screen:** Terminal shows "✅ Human approved" + agent resolves + leaves comment

**Say:**
> "It picked it up. Resolved the event. Left a comment in Notion. Human and AI, coordinating through Notion."

---

## SCENE 6 — Digest + Close [1:35 - 1:55]

**On screen:** Terminal, Step 8 (digest generation)

**Say:**
> "Finally, a daily portfolio digest. Gemini writes it, MCP publishes it as a rich Notion page."

**Cmd+Tab to Notion.**

**On screen:** Open 📝 Digests → click today's digest → scroll through tables and callouts

**Say:**
> "Tables, callouts, toggles — all from one Markdown string through MCP."

**Cmd+Tab back to terminal.**

**On screen:** Summary box with MCP call counts

**Say:**
> "That's VaultRoom. Real blockchain data, AI risk analysis, human-in-the-loop approval — all through Notion MCP."

*End recording.*

---

## Quick Reference — Lines to Say

1. "This is VaultRoom — a DeFi risk agent that uses Notion as its control plane through MCP."
2. "The agent reads wallet config from Notion, then fetches live on-chain data — Cardano via Blockfrost, Ethereum via ethers. Real testnet balances."
3. "Health factor 0.98. Below 1.0. Liquidation is imminent. The engine flags it as critical."
4. "Gemini analyzes the signal. The agent creates the event in Notion's Risk Dashboard — through MCP, not the REST API."
5. "Here it is in Notion. Critical severity, AI analysis. Status: Escalated — waiting for human approval."
6. "Now the agent polls Notion every 5 seconds. This is the bidirectional part."
7. "I'll approve it now." *(click in Notion)*
8. "It picked it up. Resolved. Comment left. Human and AI, coordinating through Notion."
9. "Daily digest. Gemini writes it, MCP publishes it as a rich Notion page."
10. "That's VaultRoom. Real blockchain data, AI risk analysis, human-in-the-loop — all through Notion MCP."

---

## If Things Go Wrong

- **MCP token expired:** The demo will fail at Step 1. Re-run `npx tsx scripts/mcp-auth.ts` and try again.
- **Approval timeout:** If you're slow switching to Notion, the poll might time out (5 min). Just edit the video — cut the wait time.
- **On-chain fetch fails:** The demo falls back to demo data automatically. Keep going.
- **Gemini rate limit:** AI step gets skipped. Still works — just no AI analysis text.
