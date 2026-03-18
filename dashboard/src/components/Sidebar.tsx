import { useState } from 'react';

const NOTION_URL = typeof window !== 'undefined'
  ? (localStorage.getItem('notionUrl') ?? 'https://notion.so')
  : 'https://notion.so';

type View = 'monitor' | 'market' | 'notion';

interface SidebarProps {
  mcpCallCounts: Record<string, number>;
  totalCalls: number;
}

export function Sidebar({ mcpCallCounts, totalCalls }: SidebarProps) {
  const [active, setActive] = useState<View>('monitor');

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: 'monitor', label: 'Monitor',      icon: '📡' },
    { id: 'market',  label: 'Market Intel', icon: '📊' },
    { id: 'notion',  label: 'Notion View',  icon: '🔗' },
  ];

  const handleClick = (id: View) => {
    if (id === 'notion') {
      window.open(NOTION_URL, '_blank', 'noopener');
    } else {
      setActive(id);
    }
  };

  return (
    <aside className="w-48 shrink-0 flex flex-col border-r border-border-dim bg-bg-primary">
      {/* Logo mark */}
      <div className="px-4 py-5 border-b border-border-dim">
        <span className="text-xs font-mono text-text-secondary uppercase tracking-widest">
          VaultRoom
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            className={[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
              item.id === active && item.id !== 'notion'
                ? 'bg-accent-purple/20 text-accent-purple'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
            ].join(' ')}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'notion' && (
              <span className="ml-auto text-xs opacity-50">↗</span>
            )}
          </button>
        ))}
      </nav>

      {/* MCP call counter */}
      <div className="px-4 py-4 border-t border-border-dim">
        <p className="text-xs text-text-secondary mb-2 font-mono uppercase tracking-wider">
          MCP Calls
        </p>
        <p className="text-lg font-mono font-semibold text-accent-purple">{totalCalls}</p>
        <div className="mt-2 space-y-0.5">
          {Object.entries(mcpCallCounts).map(([tool, count]) => (
            <div key={tool} className="flex justify-between text-xs text-text-secondary font-mono">
              <span className="truncate mr-1">{tool.replace('notion-', '')}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
