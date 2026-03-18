import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CriticalAlert } from '../types.ts';

interface CriticalAlertToastProps {
  alert: CriticalAlert;
}

export function CriticalAlertToast({ alert }: CriticalAlertToastProps) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-6 right-6 z-50 max-w-sm"
        >
          <div className="bg-bg-card border border-status-danger/60 rounded-xl shadow-lg shadow-status-danger/10 overflow-hidden">
            {/* Red accent bar */}
            <div className="h-0.5 bg-status-danger w-full" />

            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-status-danger text-sm font-bold font-mono uppercase tracking-wide">
                      🔴 Critical Alert
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-text-primary mb-1">
                    {alert.protocol}
                  </p>
                  <p className="text-xs text-text-secondary leading-snug">
                    {alert.event}
                  </p>
                  <p className="mt-2 text-xs font-mono">
                    <span className="text-text-secondary">Health Factor: </span>
                    <span className="text-status-danger font-semibold">
                      {alert.healthFactor.toFixed(2)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-text-secondary hover:text-text-primary transition-colors text-lg leading-none mt-0.5 shrink-0"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>

              <p className="mt-3 text-xs text-text-secondary italic">
                Review in Notion Risk Dashboard → approve or escalate
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
