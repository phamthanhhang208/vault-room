import { JsonRpcProvider, Contract, formatEther, formatUnits } from 'ethers';
import type { ChainAdapter, WalletSnapshot, TokenBalance, ChainTx } from './types.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

const TOP_TOKENS: Array<{ symbol: string; address: string; decimals: number; isStable: boolean }> = [
  { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, isStable: true },
  { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, isStable: true },
  { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, isStable: false },
  { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, isStable: false },
  { symbol: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, isStable: true },
];

async function fetchEthPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ethereum?: { usd?: number } };
    return data.ethereum?.usd ?? null;
  } catch {
    return null;
  }
}

const TESTNET_ETH_PRICE = 3500; // simulated price for demo display

export class EthereumAdapter implements ChainAdapter {
  readonly chain = 'ethereum' as const;
  private readonly provider: JsonRpcProvider;
  private readonly isTestnet: boolean;

  constructor(rpcUrl: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.isTestnet =
      rpcUrl.includes('sepolia') ||
      rpcUrl.includes('goerli') ||
      rpcUrl.includes('holesky');
  }

  private async getEthPrice(): Promise<number | null> {
    if (this.isTestnet) {
      return TESTNET_ETH_PRICE;
    }
    return fetchEthPrice();
  }

  async getWalletSnapshot(address: string): Promise<WalletSnapshot> {
    const balances = await withRetry(() => this.getBalances(address), {
      label: `Ethereum balances(${address.slice(0, 10)}...)`,
    });

    return {
      address,
      chain: 'ethereum',
      balances,
      positions: [], // v2: Aave subgraph integration
      recentTxs: this.getRecentTxs(),
      fetchedAt: Date.now(),
    };
  }

  async getBalances(address: string): Promise<TokenBalance[]> {
    const balances: TokenBalance[] = [];

    const ethWei = await this.provider.getBalance(address);
    const ethAmount = Number(formatEther(ethWei));
    const ethPrice = await this.getEthPrice();

    balances.push({
      symbol: 'ETH',
      amount: ethAmount,
      decimals: 18,
      valueUsd: ethPrice !== null ? ethAmount * ethPrice : null,
    });

    if (this.isTestnet) {
      logger.debug('[Ethereum] Skipping ERC-20 checks on testnet (different contract addresses)');
    } else {
      await Promise.allSettled(
        TOP_TOKENS.map(async (token) => {
          try {
            const contract = new Contract(token.address, ERC20_ABI, this.provider);
            const raw = (await contract.getFunction('balanceOf')(address)) as bigint;
            const amount = Number(formatUnits(raw, token.decimals));
            if (amount > 0) {
              balances.push({
                symbol: token.symbol,
                amount,
                decimals: token.decimals,
                valueUsd: token.isStable ? amount : null, // stablecoins ~ $1
              });
            }
          } catch {
            // Token not held or call failed — skip silently
          }
        }),
      );
    }

    return balances;
  }

  getRecentTxs(): ChainTx[] {
    // Public RPCs don't support eth_getTransactionHistory
    // v2: integrate optional ETHERSCAN_API_KEY for full tx history
    logger.warn('[Ethereum] Tx history unavailable without Etherscan API key — skipping');
    return [];
  }

  async getProtocolTvl(_contractAddress: string): Promise<number> {
    // v2: integrate Aave subgraph for real lending TVL
    return 0;
  }
}
