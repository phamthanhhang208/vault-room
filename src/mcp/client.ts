import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../utils/logger.js';

export type McpTextContent = { type: 'text'; text: string };
export type McpContent = McpTextContent | { type: string; [key: string]: unknown };

export interface ToolResult {
  content: McpContent[];
  isError?: boolean;
}

/**
 * Thin wrapper around the MCP SDK Client.
 * Connects to the remote Notion MCP server using a Bearer token.
 */
export class McpClient {
  private constructor(private readonly client: Client) {}

  static async connect(
    accessToken: string,
    serverUrl = 'https://mcp.notion.com/mcp',
  ): Promise<McpClient> {
    const client = new Client(
      { name: 'vault-room', version: '0.1.0' },
      { capabilities: {} },
    );

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    await client.connect(transport);
    logger.info('[MCP] Connected to Notion MCP server');
    return new McpClient(client);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    logger.debug(`[MCP] → ${name}`);
    const result = await this.client.callTool({ name, arguments: args });
    return result as ToolResult;
  }

  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    const result = await this.client.listTools();
    return result.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  /** Extract the first text content item from a tool result */
  static extractText(result: ToolResult): string {
    for (const item of result.content) {
      if (item.type === 'text') return (item as McpTextContent).text;
    }
    return '';
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /** Alias for close() — used by orchestrator shutdown */
  async disconnect(): Promise<void> {
    await this.close();
    logger.info('[MCP] Disconnected from Notion MCP server');
  }
}
