import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  format?: 'number' | 'currency' | 'decimal';
  accent?: string;
}

function useCountUp(target: number, duration = 1200) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const raf = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(target * eased);
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);

  return current;
}

function StatCard({ label, value, prefix = '', suffix = '', format = 'number', accent }: StatCardProps) {
  const animated = useCountUp(value);

  const formatted = format === 'currency'
    ? `$${Math.round(animated).toLocaleString()}`
    : format === 'decimal'
      ? animated.toFixed(2)
      : Math.round(animated).toString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 bg-bg-card border border-border-dim rounded-xl px-6 py-5"
    >
      <p className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
        {label}
      </p>
      <p className={`text-3xl font-mono font-semibold ${accent ?? 'text-text-primary'}`}>
        {prefix}{formatted}{suffix}
      </p>
    </motion.div>
  );
}

interface StatsBarProps {
  totalExposure: number;
  avgHealth: number;
  activeAlerts: number;
}

export function StatsBar({ totalExposure, avgHealth, activeAlerts }: StatsBarProps) {
  const alertColor = activeAlerts > 0 ? 'text-status-warn' : 'text-status-safe';
  const healthColor = avgHealth < 1.1 ? 'text-status-danger'
    : avgHealth < 1.3 ? 'text-status-warn'
    : 'text-status-safe';

  return (
    <div className="flex gap-4">
      <StatCard
        label="Total Exposure"
        value={totalExposure}
        format="currency"
        accent="text-text-primary"
      />
      <StatCard
        label="Avg Health Factor"
        value={avgHealth}
        format="decimal"
        accent={healthColor}
      />
      <StatCard
        label="Active Alerts"
        value={activeAlerts}
        format="number"
        accent={alertColor}
      />
    </div>
  );
}
