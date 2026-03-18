export interface TokenBalance {
  symbol: string;
  amount: number;
  decimals: number;
  valueUsd: number | null; // null if price feed unavailable
}

export interface ChainTx {
  hash: string;
  timestamp: Date;
  type: 'in' | 'out';
  amount: number;
  token: string;
  counterparty?: string;
}

export interface ProtocolPosition {
  protocol: string;
  positionType: 'lending' | 'lp' | 'staking';
  supplied: number;
  borrowed: number;
  healthFactor: number | null;
  valueUsd: number;
}

export interface WalletSnapshot {
  address: string;
  chain: 'cardano' | 'ethereum';
  balances: TokenBalance[];
  positions: ProtocolPosition[];
  recentTxs: ChainTx[];
  fetchedAt: number;
}

export interface ChainAdapter {
  chain: 'cardano' | 'ethereum';
  getWalletSnapshot(address: string): Promise<WalletSnapshot>;
  getProtocolTvl?(contractAddress: string): Promise<number>;
}
