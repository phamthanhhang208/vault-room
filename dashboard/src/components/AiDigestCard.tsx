import { motion } from 'framer-motion';

interface AiDigestCardProps {
  digest: string;
  date?: string;
}

const EXCERPT_LENGTH = 280;

export function AiDigestCard({ digest, date }: AiDigestCardProps) {
  const excerpt = digest.length > EXCERPT_LENGTH
    ? digest.slice(0, EXCERPT_LENGTH).trimEnd() + '…'
    : digest;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="relative rounded-xl overflow-hidden border border-accent-purple/30"
      style={{
        background: 'linear-gradient(135deg, #1a1030 0%, #0f0b1e 60%, #12121a 100%)',
      }}
    >
      {/* Subtle purple glow */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top left, #6c5ce7 0%, transparent 60%)',
        }}
      />

      <div className="relative px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📝</span>
            <span className="text-sm font-semibold text-text-primary">Daily Digest</span>
          </div>
          {date && (
            <span className="text-xs font-mono text-text-secondary">{date}</span>
          )}
        </div>

        {excerpt ? (
          <p className="text-sm text-text-secondary leading-relaxed">{excerpt}</p>
        ) : (
          <p className="text-sm text-text-secondary italic">
            No digest available — run <span className="font-mono text-accent-purple">pnpm run digest</span> to generate one.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-accent-purple">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-pulse-slow" />
            Powered by Gemini 2.5 Pro · via Notion MCP
          </span>
        </div>
      </div>
    </motion.div>
  );
}
