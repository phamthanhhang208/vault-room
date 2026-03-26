import { McpClient, type ToolResult } from './client.js';
import { logger } from '../utils/logger.js';

// ─── Response types ───────────────────────────────────────────────────────────

export interface NotionSearchResult {
  id: string;
  type: 'page' | 'database';
  title: string;
  url: string;
}

export interface DatabaseRow {
  id: string;
  properties: Record<string, unknown>;
  rawText: string;
}

export interface CreatePageInput {
  parentDatabaseId: string;
  properties: Record<string, unknown>;
  content?: string; // Notion-flavored Markdown
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseSearchResults(result: ToolResult): NotionSearchResult[] {
  const text = McpClient.extractText(result);
  logger.debug(`[MCP] search raw: ${text.slice(0, 300)}`);

  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    const arr = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)['results'];
    if (Array.isArray(arr)) {
      return arr.map((item: Record<string, unknown>) => ({
        id: String(item['id'] ?? ''),
        type: (item['object'] === 'database' ? 'database' : 'page') as 'page' | 'database',
        title: extractTitleFromSearchItem(item),
        url: String(item['url'] ?? ''),
      }));
    }
  }

  // Fallback: return empty array and let callers handle
  return [];
}

function extractTitleFromSearchItem(item: Record<string, unknown>): string {
  // Try common title locations in Notion API responses
  const props = item['properties'] as Record<string, unknown> | undefined;
  if (props) {
    const titleProp = Object.values(props).find(
      (p) => (p as Record<string, unknown>)?.['type'] === 'title',
    ) as Record<string, unknown> | undefined;
    const titleArr = titleProp?.['title'] as Array<Record<string, unknown>> | undefined;
    if (titleArr?.[0]) return String((titleArr[0] as Record<string, unknown>)['plain_text'] ?? '');
  }
  return String(item['title'] ?? item['id'] ?? '');
}

function parseQueryResults(result: ToolResult): DatabaseRow[] {
  const text = McpClient.extractText(result);
  logger.debug(`[MCP] query raw: ${text.slice(0, 300)}`);

  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    const results = (parsed as Record<string, unknown>)['results'];
    if (Array.isArray(results)) {
      return results.map((row: Record<string, unknown>) => ({
        id: String(row['id'] ?? ''),
        properties: (row['properties'] as Record<string, unknown>) ?? {},
        rawText: text,
      }));
    }
  }

  return [];
}

function parseCreatedPageIds(result: ToolResult): string[] {
  const text = McpClient.extractText(result);
  logger.debug(`[MCP] create raw: ${text.slice(0, 300)}`);

  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    // Single page response: { id: '...' }
    if (typeof (parsed as Record<string, unknown>)['id'] === 'string') {
      return [String((parsed as Record<string, unknown>)['id'])];
    }
    // Array: [{ id: '...' }] or { results: [{ id: '...' }] }
    const arr = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>)['results'] as unknown[]);
    if (Array.isArray(arr)) {
      return arr.map((item) => String((item as Record<string, unknown>)['id'] ?? ''));
    }
  }

  // Try to extract UUID-like IDs from text
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  if (uuidMatch) return uuidMatch;

  return [];
}

function parseCreatedDbId(result: ToolResult): string {
  const text = McpClient.extractText(result);
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    const id = (parsed as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuidMatch ? uuidMatch[0] : '';
}

// ─── NotionTools ──────────────────────────────────────────────────────────────

/**
 * Typed wrappers around raw MCP tool calls to the Notion MCP server.
 * All calls are rate-limited to stay under the 180 req/min limit.
 */
export class NotionTools {
  private lastCallTime = 0;
  private readonly callCounts = new Map<string, number>();

  constructor(private readonly mcp: McpClient) {}

  getCallCounts(): ReadonlyMap<string, number> {
    return this.callCounts;
  }

  getTotalCalls(): number {
    return [...this.callCounts.values()].reduce((a, b) => a + b, 0);
  }

  // ─── Rate limiting ──────────────────────────────────────────────────────────

  private async call(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    this.callCounts.set(tool, (this.callCounts.get(tool) ?? 0) + 1);
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < 200) {
      await new Promise((res) => setTimeout(res, 200 - elapsed));
    }
    this.lastCallTime = Date.now();
    return this.mcp.callTool(tool, args);
  }

  // ─── Search & Fetch ─────────────────────────────────────────────────────────

  async search(query: string): Promise<NotionSearchResult[]> {
    const result = await this.call('notion-search', { query });
    return parseSearchResults(result);
  }

  async fetchPage(pageIdOrUrl: string): Promise<string> {
    const result = await this.call('notion-fetch', { url: pageIdOrUrl });
    return McpClient.extractText(result);
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  async queryDatabaseView(
    databaseId: string,
    filter?: Record<string, unknown>,
  ): Promise<DatabaseRow[]> {
    const args: Record<string, unknown> = { database_id: databaseId };
    if (filter) args['filter'] = filter;
    const result = await this.call('notion-query-database-view', args);
    return parseQueryResults(result);
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  /**
   * Create pages in a database using the hosted MCP's flat property format.
   * Properties should be flat key-value pairs (string | number | null).
   * Use `data_source_id` (collection://) as parentDatabaseId.
   * Dates must use expanded format: `"date:Field:start"`.
   * Checkboxes must use `"__YES__"` / `"__NO__"`.
   */
  async createPages(pages: CreatePageInput[]): Promise<string[]> {
    const result = await this.call('notion-create-pages', {
      parent: { data_source_id: pages[0]?.parentDatabaseId, type: 'data_source_id' },
      pages: pages.map((p) => ({
        properties: p.properties,
        ...(p.content ? { content: p.content } : {}),
      })),
    });
    return parseCreatedPageIds(result);
  }

  async createDatabase(
    parentPageId: string,
    title: string,
    schema: string,
  ): Promise<string> {
    const result = await this.call('notion-create-database', {
      parent: { page_id: parentPageId, type: 'page_id' },
      title,
      schema,
    });
    return parseCreatedDbId(result);
  }

  async createPage(
    parentPageId: string,
    title: string,
    content?: string,
  ): Promise<string> {
    const result = await this.call('notion-create-pages', {
      parent: { page_id: parentPageId, type: 'page_id' },
      pages: [{
        properties: { title },
        ...(content ? { content } : {}),
      }],
    });
    const ids = parseCreatedPageIds(result);
    return ids[0] ?? '';
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
    content?: string,
  ): Promise<void> {
    const args: Record<string, unknown> = {
      page_id: pageId,
      command: 'update_properties',
      properties,
    };
    await this.call('notion-update-page', args);
    if (content) {
      await this.call('notion-update-page', {
        page_id: pageId,
        command: 'replace_content',
        new_str: content,
      });
    }
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  async addComment(pageId: string, text: string): Promise<void> {
    await this.call('notion-create-comment', {
      page_id: pageId,
      text: text.slice(0, 2000),
    });
  }
}
