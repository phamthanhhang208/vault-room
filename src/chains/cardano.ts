import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import type { ChainAdapter, WalletSnapshot, TokenBalance, ChainTx, ProtocolPosition } from './types.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

const LOVELACE_PER_ADA = 1_000_000;

// Known protocol token policy IDs (first 56 chars of unit) → protocol name
const KNOWN_PROTOCOL_TOKENS: Record<string, string> = {
  '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6': 'Minswap',
  'e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed72': 'SundaeSwap',
  '1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e': 'WingRiders',
};

async function fetchAdaPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd',
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cardano?: { usd?: number } };
    return data.cardano?.usd ?? null;
  } catch {
    return null;
  }
}

const TESTNET_ADA_PRICE = 0.65; // simulated price for demo display

export class CardanoAdapter implements ChainAdapter {
  readonly chain = 'cardano' as const;
  private readonly api: BlockFrostAPI;
  private readonly isTestnet: boolean;
  private readonly txCache = new Map<string, ChainTx>();

  constructor(apiKey: string, network: string) {
    // Network is inferred from the projectId prefix in Blockfrost v5
    this.api = new BlockFrostAPI({ projectId: apiKey });
    this.isTestnet = network !== 'mainnet';
  }

  private async getAdaPrice(): Promise<number | null> {
    if (this.isTestnet) {
      return TESTNET_ADA_PRICE;
    }
    return fetchAdaPrice();
  }

  async getWalletSnapshot(address: string): Promise<WalletSnapshot> {
    const addrInfo = await withRetry(() => this.api.addresses(address), {
      label: `Blockfrost addresses(${address.slice(0, 12)}...)`,
    });

    const adaPrice = await this.getAdaPrice();
    const balances = this.parseBalances(addrInfo.amount, adaPrice);
    const position = this.parseProtocolPosition(addrInfo.amount);

    const recentTxs = await withRetry(() => this.getRecentTxs(address), {
      label: `Blockfrost txs(${address.slice(0, 12)}...)`,
    });

    return {
      address,
      chain: 'cardano',
      balances,
      positions: position ? [position] : [],
      recentTxs,
      fetchedAt: Date.now(),
    };
  }

  private parseBalances(
    amounts: Array<{ unit: string; quantity: string }>,
    adaPrice: number | null,
  ): TokenBalance[] {
    const balances: TokenBalance[] = [];

    const lovelaceEntry = amounts.find((a) => a.unit === 'lovelace');
    const lovelace = Number(lovelaceEntry?.quantity ?? '0');
    const adaAmount = lovelace / LOVELACE_PER_ADA;

    balances.push({
      symbol: 'ADA',
      amount: adaAmount,
      decimals: 6,
      valueUsd: adaPrice !== null ? adaAmount * adaPrice : null,
    });

    for (const token of amounts) {
      if (token.unit === 'lovelace') continue;
      // unit = policyId (56 chars) + assetName (hex) — use last part as symbol
      const symbol = token.unit.slice(56) || token.unit.slice(0, 8);
      balances.push({
        symbol,
        amount: Number(token.quantity),
        decimals: 0,
        valueUsd: null, // v1: native token pricing skipped
      });
    }

    return balances;
  }

  private parseProtocolPosition(
    amounts: Array<{ unit: string; quantity: string }>,
  ): ProtocolPosition | null {
    for (const token of amounts) {
      if (token.unit === 'lovelace') continue;
      const policyId = token.unit.slice(0, 56);
      const protocol = KNOWN_PROTOCOL_TOKENS[policyId];
      if (protocol) {
        return {
          protocol,
          positionType: 'staking',
          supplied: Number(token.quantity),
          borrowed: 0,
          healthFactor: null, // Cardano lending health not computable in v1
          valueUsd: 0, // native token pricing skipped
        };
      }
    }
    return null;
  }

  async getRecentTxs(address: string, limit = 10): Promise<ChainTx[]> {
    const txList = await this.api.addressesTransactions(address, {
      count: limit,
      order: 'desc',
    });

    const txs: ChainTx[] = [];

    for (const { tx_hash } of txList) {
      const cached = this.txCache.get(tx_hash);
      if (cached) {
        txs.push(cached);
        continue;
      }

      try {
        const [txDetail, utxos] = await Promise.all([
          this.api.txs(tx_hash),
          this.api.txsUtxos(tx_hash),
        ]);

        // If address appears in outputs → receiving (in), otherwise sending (out)
        const isReceiving = utxos.outputs.some((o) => o.address === address);
        const type: 'in' | 'out' = isReceiving ? 'in' : 'out';

        const relevantSide = isReceiving ? utxos.outputs : utxos.inputs;
        const adaAmount = relevantSide
          .filter((u) => u.address === address)
          .reduce((sum, u) => {
            const lovelaceEntry = u.amount.find((a) => a.unit === 'lovelace');
            return sum + Number(lovelaceEntry?.quantity ?? '0') / LOVELACE_PER_ADA;
          }, 0);

        const tx: ChainTx = {
          hash: tx_hash,
          timestamp: new Date(txDetail.block_time * 1000),
          type,
          amount: adaAmount,
          token: 'ADA',
        };

        this.txCache.set(tx_hash, tx);
        txs.push(tx);
      } catch (err) {
        logger.warn(
          `[Cardano] Failed to fetch tx ${tx_hash}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return txs;
  }

  async getProtocolTvl(_contractAddress: string): Promise<number> {
    // v2: implement via Blockfrost script UTxO aggregation
    return 0;
  }
}
