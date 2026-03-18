import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RiskAnalysisPanelProps {
  riskAnalysis: string;
}

export function RiskAnalysisPanel({ riskAnalysis }: RiskAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (!riskAnalysis) return null;

  return (
    <div className="bg-bg-card border border-border-dim rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-bg-card-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-status-info text-base">🤖</span>
          <span className="text-sm font-semibold text-text-primary">
            Gemini Risk Analysis
          </span>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-secondary text-xs"
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 border-t border-border-dim pt-4">
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                {riskAnalysis}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
