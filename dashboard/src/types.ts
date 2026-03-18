export interface Position {
  name: string;
  protocol: string;
  chain: 'cardano' | 'ethereum';
  wallet: string;
  valueUsd: number;
  healthFactor: number;
  riskLevel: 'safe' | 'warning' | 'danger';
  lastUpdated: string;
}

export interface CriticalAlert {
  protocol: string;
  healthFactor: number;
  event: string;
}

export interface DashboardData {
  lastUpdated: string | null;
  totalExposure: number;
  avgHealth: number;
  activeAlerts: number;
  positions: Position[];
  latestDigest: string;
  criticalAlert: CriticalAlert | null;
  riskAnalysis: string;
  mcpStatus: 'connected' | 'disconnected';
  mcpCallCounts: Record<string, number>;
}
