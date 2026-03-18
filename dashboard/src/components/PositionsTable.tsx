import { motion } from 'framer-motion';
import type { Position } from '../types.ts';

const RISK_CONFIG = {
  safe:    { bar: 'bg-status-safe',   text: 'text-status-safe',   label: '✓ Safe'    },
  warning: { bar: 'bg-status-warn',   text: 'text-status-warn',   label: '▲ Warning' },
  danger:  { bar: 'bg-status-danger', text: 'text-status-danger', label: '⚠ Danger'  },
};

function HealthBar({ healthFactor, riskLevel }: { healthFactor: number; riskLevel: Position['riskLevel'] }) {
  // Map HF 0–2.0 to 0–100% bar width
  const pct = Math.min((healthFactor / 2) * 100, 100);
  const { bar } = RISK_CONFIG[riskLevel];

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-1.5 bg-border-dim rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${bar}`}
        />
      </div>
      <span className="font-mono text-sm">{healthFactor.toFixed(2)}</span>
    </div>
  );
}

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="bg-bg-card border border-border-dim rounded-xl p-6">
        <p className="text-text-secondary text-sm text-center">
          No positions tracked — run a monitor cycle first
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-dim rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border-dim flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Positions</h2>
        <span className="text-xs text-text-secondary font-mono">{positions.length} tracked</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-dim">
            {['Protocol', 'Chain', 'Value', 'Health Factor', 'Risk'].map((h) => (
              <th
                key={h}
                className="px-6 py-3 text-left text-xs font-mono text-text-secondary uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => {
            const { text, label } = RISK_CONFIG[pos.riskLevel];
            return (
              <motion.tr
                key={pos.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="border-b border-border-dim last:border-0 hover:bg-bg-card-hover transition-colors"
              >
                <td className="px-6 py-4 font-medium text-text-primary">{pos.protocol}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-border-dim text-text-secondary uppercase">
                    {pos.chain}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-text-primary">
                  ${pos.valueUsd.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <HealthBar healthFactor={pos.healthFactor} riskLevel={pos.riskLevel} />
                </td>
                <td className={`px-6 py-4 font-mono text-xs font-semibold ${text}`}>
                  {label}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
