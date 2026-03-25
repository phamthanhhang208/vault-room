# VaultRoom — Demo Video Script (~2-3 min)

## Recording Setup
- **Terminal**: Run `pnpm run demo` (the output is the star)
- **Browser**: Notion workspace open in a second window/tab
- **Screen recorder**: OBS, QuickTime, or Loom
- **Layout**: Split screen — terminal left, Notion right (or switch between them)
- **Font size**: Bump terminal to 16-18pt so it's readable

---

## Script

### [0:00 - 0:15] Intro — What is VaultRoom?

**Show:** Terminal, about to run the demo

**Say/Caption:**
> "VaultRoom is a DeFi risk monitoring agent that uses Notion as its control plane. Every interaction goes through the Notion MCP server — no REST API, just MCP."

**Action:** Press enter to run `pnpm run demo`. The banner appears.

---

### [0:15 - 0:30] Step 1 — MCP Connection

**Show:** Terminal showing MCP connection + tool list

**Say/Caption:**
> "First, the agent connects to Notion's hosted MCP server via OAuth. We get access to 14 tools — search, fetch, create pages, update pages, comments, and more."

**Highlight:** The list of MCP tools scrolling by.

---

### [0:30 - 0:55] Step 2 — Read Config from Notion

**Show:** Terminal showing config being read, then quickly switch to Notion showing the ⚙️ Config database

**Say/Caption:**
> "The agent reads its configuration from Notion. Wallets to monitor, health factor thresholds, polling intervals — all set by the human operator in a Notion database. No config files, no redeployment. Change it in Notion, the agent adapts on the next cycle."

**Action:** Show the Config DB in Notion with the wallet address and thresholds visible.

---

### [0:55 - 1:15] Step 3 — Live On-Chain Data

**Show:** Terminal showing Blockfrost/Ethereum data being fetched

**Say/Caption:**
> "Now it fetches real on-chain data. Cardano via Blockfrost, Ethereum via ethers.js. Wallet balances, token holdings, recent transactions — all from the live testnet."

**Highlight:** The wallet balances and ADA/ETH amounts scrolling by.

---

### [1:15 - 1:40] Step 4-5 — Positions & Risk Detection

**Show:** Terminal showing positions table with health factors, then risk engine results

**Say/Caption:**
> "The agent loads DeFi positions and runs the risk engine. Rule-based checks flag anything suspicious — health factors below threshold, whale movements, balance drops. Here we see a critical signal: a lending position with health factor 0.98 — that's below 1.0, meaning liquidation is imminent."

**Highlight:** The red critical alert in the terminal.

---

### [1:40 - 2:05] Step 6 — AI Analysis + Write to Notion

**Show:** Terminal showing Gemini analysis, then switch to Notion Risk Dashboard

**Say/Caption:**
> "Gemini 2.5 Pro analyzes the critical signal and writes a plain-English risk assessment with a recommended action. The agent writes this to Notion's Risk Dashboard via MCP — notion-create-pages. Every write you see here is an MCP tool call, not a REST API request."

**Action:** Switch to Notion, show the 🚨 Risk Dashboard with the new event. Click into it to show the AI analysis and "Escalated" status.

---

### [2:05 - 2:30] Step 7 — Human Approval (the showcase)

**Show:** Split screen — terminal polling on left, Notion on right

**Say/Caption:**
> "This is the bidirectional showcase. The agent has escalated a critical alert and is now polling Notion via MCP, waiting for human approval. Watch — I'll change the status to 'Approved' in Notion..."

**Action:**
1. In Notion, click the Status field on the escalated event
2. Change from "Escalated" to "Approved"
3. Switch back to terminal — it detects the change!

**Say/Caption:**
> "The agent detected the approval, resolved the event, and left a comment in Notion acknowledging the decision. Human and AI, coordinating through Notion."

---

### [2:30 - 2:50] Step 8 — Daily Digest

**Show:** Terminal showing digest generation, then Notion digest page

**Say/Caption:**
> "Finally, the agent generates a daily portfolio digest. Gemini writes the briefing, and VaultRoom publishes it as a rich Notion page — tables, callouts, toggles — all from a single Markdown string through MCP."

**Action:** Switch to Notion, open the 📝 Digests page, click into today's digest. Scroll through the tables and recommendations.

---

### [2:50 - 3:00] Closing

**Show:** Terminal summary box with MCP call counts

**Say/Caption:**
> "That's VaultRoom. Real blockchain data, AI risk analysis, and a human-in-the-loop approval cycle — all through Notion MCP. The entire Notion integration is 7 MCP tool calls, zero SDK usage. Notion isn't a dashboard — it's the control plane."

---

## Tips for Recording

1. **Pre-run the demo once** to make sure MCP token is fresh and everything works
2. **Refresh the MCP token** right before recording: `npx tsx scripts/mcp-auth.ts` or the token refresh
3. **Have Notion open** to the VaultRoom parent page already
4. **For Step 7** (approval): You need to be fast — change the status in Notion while the agent polls. Practice this timing.
5. **If the polling times out**, just edit the video to cut the wait. Or reduce the poll interval in the demo script.
6. **Post-processing**: Speed up any slow loading sections to 2x. Keep the key moments at 1x.
7. **No audio is fine** — captions/text overlays work great for challenge submissions.
