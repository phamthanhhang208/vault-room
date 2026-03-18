import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { Position } from '../types.js';
import type { RiskSignal } from '../risk/signals.js';

export interface DashboardSnapshot {
  totalExposure: number;
  avgHealth: number;
  activeAlerts: number;
  positions: Position[];
  latestDigest: string;
  riskAnalysis: string;
  mcpCallCounts: Record<string, number>;
}

const DATA_PATH = join(process.cwd(), 'dashboard', 'public', 'data.json');

export async function writeDashboardData(snap: DashboardSnapshot): Promise<void> {
  const criticalPosition = snap.positions.find((p) => p.riskLevel === 'danger');

  const data = {
    lastUpdated: new Date().toISOString(),
    totalExposure: snap.totalExposure,
    avgHealth: snap.avgHealth,
    activeAlerts: snap.activeAlerts,
    positions: snap.positions,
    latestDigest: snap.latestDigest,
    criticalAlert: criticalPosition
      ? {
          protocol: criticalPosition.protocol,
          healthFactor: criticalPosition.healthFactor,
          event: `${criticalPosition.protocol} health factor at ${criticalPosition.healthFactor.toFixed(2)} — ${criticalPosition.healthFactor < 1.0 ? 'liquidation imminent' : 'below threshold'}`,
        }
      : null,
    riskAnalysis: snap.riskAnalysis,
    mcpStatus: 'connected',
    mcpCallCounts: snap.mcpCallCounts,
  };

  try {
    await writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Dashboard folder may not exist — silently skip
  }
}

export function buildSnapshot(
  positions: Position[],
  signals: RiskSignal[],
  latestDigest: string,
  riskAnalysis: string,
  mcpCallCounts: Record<string, number>,
): DashboardSnapshot {
  const totalExposure = positions.reduce((s, p) => s + p.valueUsd, 0);
  const healthPositions = positions.filter((p) => p.healthFactor > 0);
  const avgHealth = healthPositions.length > 0
    ? healthPositions.reduce((s, p) => s + p.healthFactor, 0) / healthPositions.length
    : 0;
  const activeAlerts = signals.filter((s) => s.severity !== 'low').length;

  return { totalExposure, avgHealth, activeAlerts, positions, latestDigest, riskAnalysis, mcpCallCounts };
}
