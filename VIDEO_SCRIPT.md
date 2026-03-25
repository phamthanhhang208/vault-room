# VaultRoom — Demo Video Script (~2 min)

## Recording Setup
- **Terminal**: Run `pnpm run demo` (the output is the star)
- **Browser**: Notion workspace open in a second window/tab
- **Screen recorder**: OBS, QuickTime, or Loom
- **Layout**: Split screen — terminal left, Notion right (or switch between them)
- **Font size**: Bump terminal to 16-18pt so it's readable

---

## Script

### [0:00 - 0:10] Intro

**Show:** Terminal with demo already running, banner visible

**Caption:**
> "VaultRoom — DeFi risk agent powered by Notion MCP. Every Notion interaction goes through MCP, zero REST API."

---

### [0:10 - 0:30] Live On-Chain Data

**Show:** Terminal fetching Blockfrost + Ethereum data

**Caption:**
> "The agent fetches real on-chain data from Cardano Preprod and Ethereum Sepolia — wallet balances, tokens, transactions."

**Highlight:** The wallet balances and ADA/token amounts.

---

### [0:30 - 0:50] Positions & Risk Detection

**Show:** Terminal positions table with health factors, then risk signals

**Caption:**
> "DeFi positions are loaded and the risk engine runs. Rule-based checks catch health factor drops, whale movements, balance anomalies. Here — health factor 0.98, below 1.0. Liquidation risk."

**Highlight:** The red critical alert.

---

### [0:50 - 1:10] AI Analysis + Write to Notion

**Show:** Terminal showing Gemini output, then switch to Notion 🚨 Risk Dashboard

**Caption:**
> "Gemini 2.5 Pro analyzes the critical signal. The agent writes the risk event to Notion via notion-create-pages — every write is an MCP call."

**Action:** Switch to Notion, show the Risk Dashboard entry with AI analysis and "Escalated" status.

---

### [1:10 - 1:40] Human Approval ⭐ (the money shot)

**Show:** Split screen — terminal polling left, Notion right

**Caption:**
> "The agent polls Notion for human approval. Watch — I'll change the status to 'Approved'..."

**Action:**
1. In Notion, click Status → change "Escalated" to "Approved"
2. Terminal detects it, resolves the event, leaves a comment

**Caption:**
> "Detected. Resolved. Comment left. Human and AI coordinating through Notion."

---

### [1:40 - 1:55] Daily Digest

**Show:** Terminal generating digest, then Notion digest page

**Caption:**
> "Daily digest — Gemini writes the briefing, VaultRoom publishes it as a rich Notion page. Tables, callouts, toggles — one Markdown string through MCP."

**Action:** Show the digest page in Notion, scroll through tables.

---

### [1:55 - 2:00] Close

**Show:** Terminal summary with MCP call counts

**Caption:**
> "7 MCP tools. Zero SDK. Notion is the control plane."

---

## Tips for Recording

1. **Pre-run the demo once** to warm up MCP token and catch errors
2. **Refresh MCP token** right before: the token refresh script or `pnpm run setup:auth`
3. **Have Notion open** to the VaultRoom workspace already
4. **For the approval step**: Change the status in Notion while the agent polls. Practice the timing.
5. **Speed up** any slow loading to 2x in post. Keep key moments at 1x.
6. **No audio needed** — captions work great for challenge submissions. Add them in post if you want.
