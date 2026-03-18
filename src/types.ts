export interface MonitorConfig {
  pageId: string;
  chain: 'cardano' | 'ethereum';
  walletAddress: string;
  healthThreshold: number;
  tvlDropPct: number;
  pollingMinutes: number;
}

export interface WatchlistEntry {
  pageId: string;
  protocol: string;
  chain: 'cardano' | 'ethereum';
  contractAddress: string;
  watchTypes: ('tvl' | 'whale' | 'health' | 'yield')[];
}

export interface Position {
  id?: string;
  name: string;
  chain: 'cardano' | 'ethereum';
  protocol: string;
  wallet: string;
  valueUsd: number;
  healthFactor: number;
  riskLevel: 'safe' | 'warning' | 'danger';
  lastUpdated: string; // ISO string
}

export interface AlertEntry {
  title: string;
  chain: 'cardano' | 'ethereum';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

export interface EscalationUpdate {
  pageId: string;
  event: string;
  chain: string;
  protocol: string;
  recommendedAction: string;
}

export interface DigestData {
  date: string; // YYYY-MM-DD
  totalExposure: number;
  avgHealth: number;
  activeAlerts: number;
  positions: Position[];
  riskEvents: import('./risk/signals.js').RiskSignal[];
  recommendations: string[];
  fullAnalysis: string;
}
