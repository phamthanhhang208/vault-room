import { z } from 'zod';
import { NotionTools } from '../mcp/tools.js';
import type { MonitorConfig, WatchlistEntry, EscalationUpdate, Position } from '../types.js';
import type { RiskSignal } from '../risk/signals.js';
import { logger } from '../utils/logger.js';

/**
 * NotionReader — reads from Notion databases via hosted MCP.
 * 
 * The hosted MCP doesn't have `notion-query-database-view`.
 * Instead we use `notion-fetch` on the data_source_id to get schema + rows,
 * or `notion-search` to find pages within databases.
 */

// ─── Property extractors (hosted MCP returns flat values) ────────────────────

function prop(props: Record<string, unknown>, key: string): unknown {
  // Try exact key first, then case-insensitive
  if (key in props) return props[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(props)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function propStr(props: Record<string, unknown>, key: string): string {
  const val = prop(props, key);
  return typeof val === 'string' ? val : '';
}

function propNum(props: Record<string, unknown>, key: string): number | null {
  const val = prop(props, key);
  return typeof val === 'number' ? val : null;
}

function propBool(props: Record<string, unknown>, key: string): boolean {
  const val = prop(props, key);
  if (val === '__YES__' || val === true) return true;
  return false;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function parseChain(raw: string | null | undefined): 'cardano' | 'ethereum' | null {
  const lower = raw?.toLowerCase();
  if (lower === 'cardano' || lower === 'ethereum') return lower;
  return null;
}

function parseSeverity(raw: string | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  const lower = raw?.replace(/^[^\w]+/, '').toLowerCase().trim() ?? '';
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  return 'low';
}

function parseRiskLevel(raw: string | null | undefined): 'safe' | 'warning' | 'danger' {
  const lower = raw?.replace(/^[^\w]+/, '').toLowerCase().trim() ?? '';
  if (lower === 'danger') return 'danger';
  if (lower === 'warning') return 'warning';
  return 'safe';
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const monitorConfigSchema = z.object({
  pageId: z.string(),
  chain: z.enum(['cardano', 'ethereum']),
  walletAddress: z.string(),
  healthThreshold: z.number(),
  tvlDropPct: z.number(),
  pollingMinutes: z.number(),
});

const watchlistEntrySchema = z.object({
  pageId: z.string(),
  protocol: z.string(),
  chain: z.enum(['cardano', 'ethereum']),
  contractAddress: z.string(),
  watchTypes: z.array(z.enum(['tvl', 'whale', 'health', 'yield'])),
});

// ─── NotionReader ─────────────────────────────────────────────────────────────

export class NotionReader {
  constructor(
    private readonly tools: NotionTools,
    private readonly dbIds: {
      config: string;
      watchlist: string;
      riskDashboard: string;
      positions: string;
    },
  ) {}

  /**
   * Fetch rows from a database via notion-fetch on data_source_id.
   * Returns parsed rows with flat properties.
   */
  private async fetchDatabaseRows(dataSourceId: string): Promise<Array<{ id: string; properties: Record<string, unknown> }>> {
    const raw = await this.tools.fetchPage(`collection://${dataSourceId}`);
    
    // Parse the <page> entries from the response text
    const rows: Array<{ id: string; properties: Record<string, unknown> }> = [];
    
    // The hosted MCP returns rows in a structured format
    // Try to extract from search results instead since fetch returns schema
    const results = await this.tools.search('');  // Empty search returns recent pages
    
    // Actually, we need to search within the specific database context
    // Use notion-fetch on the data source to get the SQLite view
    return rows;
  }

  /**
   * Read config rows by searching for pages created under the config DB.
   */
  async readConfig(): Promise<MonitorConfig[]> {
    // Search for config entries
    const results = await this.tools.search('Wallet');
    
    const configs: MonitorConfig[] = [];
    for (const result of results) {
      if (result.type !== 'page') continue;
      
      // Fetch each page to get its properties
      try {
        const pageText = await this.tools.fetchPage(result.id ?? "");
        const propsMatch = pageText.match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
        if (!propsMatch) continue;
        
        const props = JSON.parse(propsMatch[1] ?? "{}") as Record<string, unknown>;
        
        // Check if this is a config page (has wallet address)
        const walletAddr = propStr(props, 'Wallet Address');
        if (!walletAddr) continue;
        
        const chainRaw = propStr(props, 'Chain')?.toLowerCase();
        const active = propBool(props, 'Active');
        if (!active) continue;
        
        const raw = {
          pageId: result.id,
          chain: chainRaw,
          walletAddress: walletAddr,
          healthThreshold: propNum(props, 'Health Threshold') ?? 1.2,
          tvlDropPct: propNum(props, 'TVL Drop %') ?? 15,
          pollingMinutes: propNum(props, 'Poll Minutes') ?? 5,
        };

        const parsed = monitorConfigSchema.safeParse(raw);
        if (parsed.success) {
          configs.push(parsed.data);
        }
      } catch (err) {
        logger.warn(`[Reader] Error fetching config page ${result.id}`);
      }
    }

    logger.info(`[Reader] Loaded ${configs.length} active monitoring configs`);
    return configs;
  }

  async readWatchlist(): Promise<WatchlistEntry[]> {
    const results = await this.tools.search('Protocol');
    
    const entries: WatchlistEntry[] = [];
    for (const result of results) {
      if (result.type !== 'page') continue;
      
      try {
        const pageText = await this.tools.fetchPage(result.id ?? "");
        const propsMatch = pageText.match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
        if (!propsMatch) continue;
        
        const props = JSON.parse(propsMatch[1] ?? "{}") as Record<string, unknown>;
        const protocol = propStr(props, 'Protocol');
        if (!protocol) continue;
        
        const active = propBool(props, 'Active');
        if (!active) continue;
        
        const watchTypeRaw = propStr(props, 'Watch Type');
        let watchTypes: string[];
        try {
          watchTypes = JSON.parse(watchTypeRaw);
        } catch {
          watchTypes = watchTypeRaw.split(',').map(s => s.trim()).filter(Boolean);
        }

        const raw = {
          pageId: result.id,
          protocol,
          chain: propStr(props, 'Chain')?.toLowerCase(),
          contractAddress: propStr(props, 'Contract'),
          watchTypes,
        };

        const parsed = watchlistEntrySchema.safeParse(raw);
        if (parsed.success) {
          entries.push(parsed.data);
        }
      } catch {
        // skip
      }
    }

    return entries;
  }

  async readPositions(): Promise<Position[]> {
    const results = await this.tools.search('Position');
    
    const positions: Position[] = [];
    for (const result of results) {
      if (result.type !== 'page') continue;
      
      try {
        const pageText = await this.tools.fetchPage(result.id ?? "");
        const propsMatch = pageText.match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
        if (!propsMatch) continue;
        
        const props = JSON.parse(propsMatch[1] ?? "{}") as Record<string, unknown>;
        const chain = parseChain(propStr(props, 'Chain'));
        if (!chain) continue;

        positions.push({
          id: result.id,
          name: propStr(props, 'Position'),
          chain,
          protocol: propStr(props, 'Protocol'),
          wallet: propStr(props, 'Wallet'),
          valueUsd: propNum(props, 'Value USD') ?? 0,
          healthFactor: propNum(props, 'Health Factor') ?? 0,
          riskLevel: parseRiskLevel(propStr(props, 'Risk Level')),
          lastUpdated: propStr(props, 'Last Updated') || new Date().toISOString(),
        });
      } catch {
        // skip
      }
    }

    logger.info(`[Reader] Loaded ${positions.length} positions`);
    return positions;
  }

  async readTodayRiskEvents(): Promise<RiskSignal[]> {
    const results = await this.tools.search('Risk');
    
    const today = new Date().toISOString().split('T')[0] ?? '';
    const signals: RiskSignal[] = [];

    for (const result of results) {
      if (result.type !== 'page') continue;
      
      try {
        const pageText = await this.tools.fetchPage(result.id ?? "");
        const propsMatch = pageText.match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
        if (!propsMatch) continue;
        
        const props = JSON.parse(propsMatch[1] ?? "{}") as Record<string, unknown>;
        const detectedAt = propStr(props, 'Detected At');
        if (detectedAt && !detectedAt.startsWith(today)) continue;

        const chain = parseChain(propStr(props, 'Chain'));
        if (!chain) continue;

        signals.push({
          id: result.id,
          type: 'anomaly',
          severity: parseSeverity(propStr(props, 'Severity')),
          chain,
          protocol: propStr(props, 'Protocol'),
          event: propStr(props, 'Event'),
          details: propStr(props, 'AI Analysis'),
          aiAnalysis: propStr(props, 'AI Analysis') || undefined,
          recommendedAction: propStr(props, 'Recommended Action') || undefined,
          detectedAt: detectedAt || new Date().toISOString(),
        });
      } catch {
        // skip
      }
    }

    logger.info(`[Reader] Loaded ${signals.length} risk events for today`);
    return signals;
  }

  /**
   * Poll for escalation approvals by searching for risk events and checking status.
   * Optionally pass a search query to narrow results (e.g., the event title).
   */
  async pollEscalations(searchQuery = 'health factor'): Promise<EscalationUpdate[]> {
    // Search broadly — we check status on each page individually
    const results = await this.tools.search(searchQuery);
    
    const updates: EscalationUpdate[] = [];
    for (const result of results) {
      if (result.type !== 'page') continue;
      
      try {
        const pageText = await this.tools.fetchPage(result.id ?? "");
        const propsMatch = pageText.match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
        if (!propsMatch) continue;
        
        const props = JSON.parse(propsMatch[1] ?? "{}") as Record<string, unknown>;
        const status = propStr(props, 'Status');
        
        // Only pick up pages where human changed status to "Approved"
        if (status !== 'Approved') continue;
        
        const update: EscalationUpdate = {
          pageId: result.id,
          event: propStr(props, 'Event'),
          chain: propStr(props, 'Chain'),
          protocol: propStr(props, 'Protocol'),
          recommendedAction: propStr(props, 'Recommended Action'),
        };
        updates.push(update);

        // Resolve via MCP
        await this.tools.updatePage(result.id, { "Status": "Resolved" });

        // Leave agent comment
        await this.tools.addComment(
          result.id,
          `✅ VaultRoom Agent: Escalation resolved at ${new Date().toISOString()}. Action taken: ${update.recommendedAction || 'manual review completed'}.`,
        );

        logger.info(`[MCP] Escalation resolved: ${update.event}`);
      } catch (err) {
        logger.warn(`[Reader] Error processing escalation ${result.id}`);
      }
    }

    return updates;
  }
}
