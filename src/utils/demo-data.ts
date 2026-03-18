import type { Position } from '../types.js';
import type { ProtocolPosition } from '../chains/types.js';

// Notion-tracked positions (used by writer, digest, risk engine health checks)
export const DEMO_POSITIONS: Position[] = [
  {
    name: 'Aave V3 — WETH/USDC',
    chain: 'ethereum',
    protocol: 'Aave V3',
    wallet: '0xDemoWallet001',
    valueUsd: 1_200_000,
    healthFactor: 1.42,
    riskLevel: 'safe',
    lastUpdated: new Date().toISOString(),
  },
  {
    name: 'GMX — WBTC Long',
    chain: 'ethereum',
    protocol: 'GMX',
    wallet: '0xDemoWallet001',
    valueUsd: 450_000,
    healthFactor: 1.15,
    riskLevel: 'warning',
    lastUpdated: new Date().toISOString(),
  },
  {
    name: 'Aerodrome — USDC/ALB',
    chain: 'ethereum',
    protocol: 'Aerodrome',
    wallet: '0xDemoWallet001',
    valueUsd: 120_000,
    healthFactor: 0.98,
    riskLevel: 'danger',
    lastUpdated: new Date().toISOString(),
  },
];

// On-chain protocol positions (used by chain adapter snapshots)
// Total exposure: $1,770,000 | Avg health: ~1.18 | Active alerts: 2
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
      healthFactor: 0.98, // CRITICAL — triggers escalation demo
      valueUsd: 120_000,
    },
  ];
}

export const DEMO_STATS = {
  totalExposure: 1_770_000,
  avgHealth: (1.42 + 1.15 + 0.98) / 3,
  activeAlerts: 2,
};
