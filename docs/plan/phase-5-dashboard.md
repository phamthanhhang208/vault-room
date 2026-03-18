# VaultRoom — Phase 5 (OPTIONAL): Web Dashboard

> **Time estimate:** ~1 day
> **Priority:** LOW — only if Phases 0-4 are rock solid
> **Depends on:** All previous phases working + demo script complete

## ⚠️ Decision gate

**Do NOT start this phase unless:**
- [ ] `pnpm run demo` works perfectly end-to-end
- [ ] README has screenshots and is polished
- [ ] DEV.to submission post is drafted
- [ ] You have at least 2 full days before the March 29 deadline
- [ ] You're not exhausted

The Notion workspace IS the primary UI. This dashboard is bonus polish.
Judges evaluate MCP integration depth, not whether you have a web app.

## What we're building

A single-page monitoring dashboard that reads cached data from the agent
and displays a real-time view. Complements (not replaces) Notion.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS
- Framer Motion (subtle animations)
- Placed in `dashboard/` folder (NOT a separate package)

## Design direction

Based on the UI mockup — dark, professional, DeFi-native aesthetic.

### Color palette
```css
:root {
  --bg-primary: #0a0a0f;
  --bg-card: #12121a;
  --bg-card-hover: #1a1a28;
  --border: #1e1e2e;
  --text-primary: #e4e4ef;
  --text-secondary: #8888a0;
  --accent-purple: #6c5ce7;
  --accent-purple-dim: #4a3db8;
  --status-safe: #00d26a;
  --status-warning: #ff9f43;
  --status-danger: #ff4757;
  --status-info: #00b4d8;
  --digest-gradient-start: #6c5ce7;
  --digest-gradient-end: #a855f7;
}
```

### Typography
- Monospace for data: "JetBrains Mono" or "IBM Plex Mono"
- Sans-serif for UI: "Outfit" or "Satoshi"
- NOT Inter, NOT Roboto

## Layout — matches mockup

```
┌──────────────────────────────────────────────────────────┐
│ ● VaultRoom v1.0          [Sync Notion] [⚙ GEMINI-CORE] │
│   ● Live Notion MCP Connected                            │
├─────────┬────────────────────────────────────────────────┤
│         │  ┌────────────┬────────────┬──────────────┐    │
│ Monitor │  │ TOTAL      │ AVG HEALTH │ ACTIVE ALERTS│    │
│         │  │ $1,770,000 │   1.34     │    2         │    │
│ Market  │  └────────────┴────────────┴──────────────┘    │
│  Intel  │                                                 │
│         │  Risk Engine Analysis panel                     │
│ Notion  │  AI Digest card (purple gradient)               │
│  View   │  Positions table (health bars)                  │
│         │                                                 │
│         │               Critical Alert toast (bottom-right)│
└─────────┴────────────────────────────────────────────────┘
```

## Data flow

Dashboard reads from a local JSON file that the agent writes after each cycle:

```typescript
// In orchestrator, after each cycle:
await fs.writeFile('dashboard/public/data.json', JSON.stringify({
  lastUpdated: new Date().toISOString(),
  totalExposure: 1770000,
  avgHealth: 1.34,
  activeAlerts: 2,
  positions: [...],
  latestDigest: "...",
  criticalAlert: { ... } | null,
  riskAnalysis: "...",
  mcpStatus: 'connected',
  mcpCallCounts: Object.fromEntries(tools.getCallCounts()),
}));
```

Dashboard polls data.json every 10 seconds.

## MCP status indicator

The dashboard header should show MCP connection status:
- Green dot + "Live Notion MCP Connected" when agent is running
- Derived from `data.json` timestamp — if lastUpdated < 2 minutes ago → connected

## Components

- **App.tsx** — Dark layout, sidebar + main
- **StatsBar.tsx** — 3 stat cards with count-up animation
- **RiskAnalysisPanel.tsx** — Expandable AI analysis card
- **AiDigestCard.tsx** — Purple gradient, latest digest excerpt
- **PositionsTable.tsx** — Health factor bars, colored by risk
- **CriticalAlertToast.tsx** — Fixed bottom-right, red, slide-in
- **Sidebar.tsx** — Monitor, Market Intel, Notion View (opens Notion URL)

## Acceptance criteria

- [ ] Dashboard renders with dark DeFi aesthetic
- [ ] Stats, positions, alerts all display from data.json
- [ ] Critical alert toast appears for health < 1.0
- [ ] "Notion View" opens workspace in new tab
- [ ] MCP connection status visible in header
- [ ] Distinctive typography (no Inter/Roboto)
- [ ] Mobile-responsive NOT required (desktop demo only)
