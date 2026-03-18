export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type SignalType =
  | 'health_factor'
  | 'whale_movement'
  | 'balance_drop'
  | 'tvl_drop'
  | 'anomaly';

export interface RiskSignal {
  id: string;
  type: SignalType;
  severity: Severity;
  chain: 'cardano' | 'ethereum';
  protocol: string;
  wallet?: string;
  event: string;
  details: string;
  aiAnalysis?: string;
  recommendedAction?: string;
  detectedAt: string; // ISO string
}
