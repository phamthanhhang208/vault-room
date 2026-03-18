import { useDashboardData } from './hooks/useDashboardData.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { StatsBar } from './components/StatsBar.tsx';
import { PositionsTable } from './components/PositionsTable.tsx';
import { RiskAnalysisPanel } from './components/RiskAnalysisPanel.tsx';
import { AiDigestCard } from './components/AiDigestCard.tsx';
import { CriticalAlertToast } from './components/CriticalAlertToast.tsx';

function McpStatusDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          'w-2 h-2 rounded-full',
          connected ? 'bg-status-safe animate-pulse-slow' : 'bg-text-secondary',
        ].join(' ')}
      />
      <span className="text-xs font-mono text-text-secondary">
        {connected ? 'Live Notion MCP Connected' : 'Agent offline'}
      </span>
    </div>
  );
}

function isMcpConnected(lastUpdated: string | null): boolean {
  if (!lastUpdated) return false;
  return Date.now() - new Date(lastUpdated).getTime() < 2 * 60 * 1000; // 2 min
}

export default function App() {
  const data = useDashboardData();

  const connected = isMcpConnected(data?.lastUpdated ?? null);
  const totalCalls = data
    ? Object.values(data.mcpCallCounts).reduce((a, b) => a + b, 0)
    : 0;

  // Derive date from lastUpdated for digest card
  const digestDate = data?.lastUpdated
    ? new Date(data.lastUpdated).toISOString().split('T')[0]
    : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary text-text-primary font-sans">
      {/* Sidebar */}
      <Sidebar
        mcpCallCounts={data?.mcpCallCounts ?? {}}
        totalCalls={totalCalls}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-border-dim shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-semibold text-text-primary">
                🏦 VaultRoom
                <span className="ml-2 text-xs font-mono text-text-secondary font-normal">v1.0</span>
              </h1>
              <McpStatusDot connected={connected} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="text-xs font-mono text-text-secondary">
                Updated {new Date(data.lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-purple/10 border border-accent-purple/20 text-xs font-mono text-accent-purple">
              ⚙ GEMINI-CORE
            </span>
          </div>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          {data ? (
            <>
              {/* Stats */}
              <StatsBar
                totalExposure={data.totalExposure}
                avgHealth={data.avgHealth}
                activeAlerts={data.activeAlerts}
              />

              {/* AI analysis + Digest side by side */}
              <div className="grid grid-cols-2 gap-5">
                <RiskAnalysisPanel riskAnalysis={data.riskAnalysis} />
                <AiDigestCard digest={data.latestDigest} date={digestDate} />
              </div>

              {/* Positions table */}
              <PositionsTable positions={data.positions} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
              <p className="text-text-secondary text-sm">
                Loading dashboard data…
              </p>
              <p className="text-text-secondary text-xs font-mono">
                Make sure the VaultRoom agent is running and has written data.json
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Critical alert toast */}
      {data?.criticalAlert && (
        <CriticalAlertToast alert={data.criticalAlert} />
      )}
    </div>
  );
}
