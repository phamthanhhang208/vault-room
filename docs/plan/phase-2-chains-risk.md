# VaultRoom — Phase 2: Chain Adapters + Risk Engine

> **Time estimate:** ~2 days
> **Priority:** HIGH — real on-chain data is the differentiator
> **Depends on:** Phase 1 (Notion MCP layer works)

## Goal

Implement chain adapters that fetch real on-chain data from Cardano (Blockfrost)
and Ethereum (ethers.js), plus a risk engine that produces typed signals from
that data. Also build the demo data helper that mirrors the UI mockup.

**This phase has minimal MCP changes** — chain adapters don't touch Notion.
The only MCP touchpoint is the risk engine writing signals via the Phase 1 writer.

## chains/types.ts — implement full interface

```typescript
interface ChainAdapter {
  chain: 'cardano' | 'ethereum';
  getBalances(wallet: string): Promise<TokenBalance[]>;
  getRecentTxs(wallet: string, limit?: number): Promise<ChainTx[]>;
  getProtocolPosition?(wallet: string, protocol: string): Promise<ProtocolPosition | null>;
}

interface TokenBalance {
  symbol: string;
  amount: number;
  valueUsd: number | null; // null if price feed unavailable
}

interface ChainTx {
  hash: string;
  timestamp: Date;
  type: 'in' | 'out';
  amount: number;
  token: string;
  counterparty?: string;
}

interface ProtocolPosition {
  protocol: string;
  positionType: 'lending' | 'lp' | 'staking';
  supplied: number;
  borrowed: number;
  healthFactor: number | null;
  valueUsd: number;
}
```

## chains/cardano.ts — Blockfrost adapter (REAL DATA)

Use `@blockfrost/blockfrost-js`. This is the primary chain — make it solid.

### getBalances(wallet)

1. Call `/addresses/{address}` → get lovelace amount + native token list
2. Convert lovelace to ADA: `lovelace / 1_000_000`
3. For ADA USD price: call `/market/prices` or fallback approach:
   - Try Blockfrost market endpoint first
   - If unavailable, use a simple fetch to CoinGecko free API:
     `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd`
   - Last resort: hardcode price with a `// TODO: live price feed` comment
4. For native tokens: return symbol + raw amount, valueUsd = null
   (pricing native tokens is complex, acceptable to skip for hackathon)
5. Wrap all calls in retry utility

### getRecentTxs(wallet, limit = 10)

1. Call `/addresses/{address}/transactions?order=desc&count={limit}`
2. For each tx hash, call `/txs/{hash}` to get timestamp and metadata
3. Call `/txs/{hash}/utxos` to determine direction (in/out) and amounts
4. Map to ChainTx type
5. **IMPORTANT:** Blockfrost has rate limits (free tier: 500 req/day for mainnet).
   - Cache tx details for the session (Map<hash, ChainTx>)
   - Batch wisely — don't fetch UTxO details for all txs, limit to `limit` param

### getProtocolPosition(wallet, protocol) — SIMPLIFIED

For Cardano DeFi position detection:
- Check if wallet holds known protocol tokens (e.g., DANO, MIN, SUNDAE)
- If found, return a basic ProtocolPosition with positionType = 'staking'
- healthFactor = null (can't easily compute on Cardano without protocol-specific logic)
- This is honest: "Cardano position detection limited to token holdings in v1"
- Return null if no known protocol tokens found

## chains/ethereum.ts — Ethers adapter (LIGHTER)

Use `ethers` v6 with public RPC (default: `https://eth.llamarpc.com`).

### getBalances(wallet)

1. `provider.getBalance(address)` → ETH balance in wei, convert to ETH
2. For top ERC-20s, hardcode contract addresses and call `balanceOf`:
   ```
   USDC:  0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
   USDT:  0xdAC17F958D2ee523a2206206994597C13D831ec7
   WETH:  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
   WBTC:  0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599
   DAI:   0x6B175474E89094C44Da98b954EedeAC495271d0F
   ```
3. Use minimal ERC-20 ABI: `["function balanceOf(address) view returns (uint256)"]`
4. ETH price: CoinGecko free API or hardcode
5. Token prices: skip for v1, set valueUsd = null for ERC-20s

### getRecentTxs(wallet, limit = 10)

- Public RPCs don't support `eth_getTransactionHistory`
- Option 1: Use Etherscan free API if user provides ETHERSCAN_API_KEY (optional env var)
- Option 2: Return empty array with logger.warn("Ethereum tx history requires Etherscan API key")
- Don't block on this — balance monitoring is sufficient for the demo

### getProtocolPosition — SKIP

- Return null always
- Aave/Compound position detection requires complex multicall + subgraph queries
- Not worth the time investment. Demo uses mock data for protocol positions.
- Comment: `// v2: integrate Aave subgraph for real lending positions`

## risk/signals.ts — full type definitions

```typescript
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type SignalType =
  | 'health_factor'
  | 'tvl_drop'
  | 'whale_movement'
  | 'balance_change'
  | 'anomaly';

export interface RiskSignal {
  id: string;                    // uuid v4
  chain: 'cardano' | 'ethereum';
  protocol: string;              // protocol name or "wallet" for general
  wallet: string;
  severity: Severity;
  type: SignalType;
  detectedAt: Date;
  message: string;               // human-readable one-liner
  rawData: Record<string, unknown>;
  aiAnalysis?: string;           // populated by Gemini
  recommendedAction?: string;    // populated by Gemini
}
```

## risk/engine.ts — the core detection class

```typescript
export class RiskEngine {
  private gemini: GenerativeModel;
  private previousBalances: Map<string, number>; // wallet → last known balance

  constructor(geminiApiKey: string);

  async analyze(
    config: MonitorConfig,
    balances: TokenBalance[],
    txs: ChainTx[],
    positions: ProtocolPosition[]
  ): Promise<RiskSignal[]>;

  private checkHealthFactor(position: ProtocolPosition, config: MonitorConfig): RiskSignal | null;
  private checkWhaleMovement(txs: ChainTx[], totalBalance: number): RiskSignal | null;
  private checkBalanceChange(wallet: string, currentBalance: number): RiskSignal | null;

  async enrichWithAI(signal: RiskSignal): Promise<RiskSignal>;
  async generateDigestAnalysis(data: DigestInput): Promise<DigestAnalysis>;
}
```

### Detection rules:

**1. Health factor check**
```
if position.healthFactor !== null && position.healthFactor < config.healthThreshold:
  if healthFactor < 1.0  → severity = 'critical'
  if healthFactor < 1.1  → severity = 'high'
  if healthFactor < 1.2  → severity = 'medium'
  else                    → severity = 'low'
  message = "{protocol} health factor at {hf} — {threshold_context}"
```

**2. Whale movement detection**
```
for each tx in recent txs:
  if tx.amount > (totalBalance * 0.10):
    severity = 'high'
    message = "Large {in/out} tx detected: {amount} {token} ({pct}% of balance)"
```

**3. Balance change anomaly**
```
previousBalance = this.previousBalances.get(wallet)
if previousBalance exists:
  changePct = ((currentBalance - previousBalance) / previousBalance) * 100
  if changePct < -50  → severity = 'critical'
  if changePct < -20  → severity = 'high'
  message = "Balance dropped {pct}% since last check"
// Always update previousBalances map after check
```

### AI enrichment:

For any signal with severity >= 'high':
1. Call Gemini via `risk/prompts.ts` analyzeRiskSignal template
2. Parse JSON response with zod
3. Attach aiAnalysis and recommendedAction to the signal
4. If Gemini adjusts severity, update it

## risk/prompts.ts — Gemini prompt templates

### analyzeRiskSignal(signal: RiskSignal): string

```
You are a DeFi risk analyst. Analyze this risk signal and provide a concise assessment.

Signal:
- Chain: {signal.chain}
- Protocol: {signal.protocol}
- Type: {signal.type}
- Current severity: {signal.severity}
- Message: {signal.message}
- Raw data: {JSON.stringify(signal.rawData)}

Respond ONLY with valid JSON, no markdown fences:
{
  "summary": "2-3 sentence risk assessment explaining the situation and implications",
  "action": "Specific recommended action the operator should take",
  "adjustedSeverity": "low | medium | high | critical"
}
```

### generateDigestAnalysis(data: DigestInput): string

```
You are a DeFi portfolio analyst writing a daily risk briefing.

Portfolio snapshot:
- Total exposure: ${data.totalExposure.toLocaleString()}
- Average health factor: {data.avgHealth}
- Active alerts: {data.activeAlerts}
- Positions: {JSON.stringify(data.positions, null, 2)}
- Today's risk events: {JSON.stringify(data.riskEvents, null, 2)}

Write a portfolio risk briefing covering:
1. Overall health assessment (1 paragraph)
2. Key risk events and their implications (1-2 paragraphs)
3. Prioritized action recommendations (numbered list, max 5)

Tone: professional, direct, like a Bloomberg terminal alert.
No fluff, no disclaimers. Under 500 words.

Respond ONLY with valid JSON, no markdown fences:
{
  "briefing": "The full briefing text with paragraphs separated by \\n\\n",
  "recommendations": ["Action 1", "Action 2", "Action 3"]
}
```

### Gemini call wrapper

```typescript
async function callGemini<T>(
  model: GenerativeModel,
  prompt: string,
  schema: ZodSchema<T>
): Promise<T> {
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  return schema.parse(JSON.parse(clean));
}
```

## utils/demo-data.ts — Mock positions matching UI mockup

```typescript
export function getDemoPositions(): ProtocolPosition[] {
  return [
    {
      protocol: 'Aave V3',
      positionType: 'lending',
      supplied: 1_800_000,
      borrowed: 600_000,
      healthFactor: 1.42,
      valueUsd: 1_200_000,
    },
    {
      protocol: 'GMX',
      positionType: 'lending',
      supplied: 600_000,
      borrowed: 150_000,
      healthFactor: 1.15,
      valueUsd: 450_000,
    },
    {
      protocol: 'Aerodrome',
      positionType: 'lp',
      supplied: 120_000,
      borrowed: 0,
      healthFactor: 0.98, // CRITICAL — triggers escalation
      valueUsd: 120_000,
    },
  ];
}

// Total exposure: $1,770,000
// Avg health: (1.42 + 1.15 + 0.98) / 3 ≈ 1.18
// Active alerts: 2 (GMX warning + Aerodrome critical)
```

## Testing checklist

1. **Cardano adapter:** real mainnet wallet → see ADA balance
2. **Ethereum adapter:** known wallet → see ETH balance
3. **Risk engine + demo data:**
   - Aerodrome (0.98) → critical signal ✓
   - GMX (1.15, threshold 1.2) → medium signal ✓
   - Aave (1.42) → no signal ✓
4. **Gemini enrichment:** critical signal gets AI analysis attached
5. **End-to-end via MCP:** engine signals → writer → Notion pages appear

## Acceptance criteria

- [ ] Cardano adapter fetches real balances from Blockfrost
- [ ] Ethereum adapter fetches real ETH balance
- [ ] Risk engine produces correct signals from demo data
- [ ] Gemini analysis attached to high/critical signals
- [ ] Demo data matches UI mockup numbers ($1.77M, 1.42, 1.15, 0.98)
- [ ] All chain API calls use retry wrapper
- [ ] Zero TypeScript errors
