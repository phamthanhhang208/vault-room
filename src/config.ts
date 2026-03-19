import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // MCP / Notion OAuth
  NOTION_MCP_URL: z.string().url().default('https://mcp.notion.com/mcp'),
  NOTION_ACCESS_TOKEN: z.string().min(1, 'Missing NOTION_ACCESS_TOKEN — run pnpm run setup:auth to authenticate'),
  NOTION_REFRESH_TOKEN: z.string().optional(),

  // Network mode
  NETWORK_MODE: z.enum(['mainnet', 'testnet']).default('testnet'),

  // Blockchain — Cardano
  BLOCKFROST_API_KEY: z.string().min(1, 'Missing BLOCKFROST_API_KEY — get one at https://blockfrost.io'),
  BLOCKFROST_NETWORK: z.enum(['mainnet', 'preprod', 'preview', 'sanchonet']).default('preprod'),

  // Blockchain — Ethereum
  ETH_RPC_URL: z.string().default(''),

  // AI
  GEMINI_API_KEY: z.string().min(1, 'Missing GEMINI_API_KEY — get one at https://aistudio.google.com'),

  // Notion DB IDs — populated by setup script
  NOTION_CONFIG_DB_ID: z.string().optional(),
  NOTION_WATCHLIST_DB_ID: z.string().optional(),
  NOTION_RISK_DASHBOARD_DB_ID: z.string().optional(),
  NOTION_POSITIONS_DB_ID: z.string().optional(),
  NOTION_ALERT_LOG_DB_ID: z.string().optional(),
  NOTION_DIGESTS_PAGE_ID: z.string().optional(),
});

// Schema requiring all DB IDs (used in agent runtime, after setup)
const fullEnvSchema = envSchema.extend({
  NOTION_CONFIG_DB_ID: z.string().min(1, 'Missing NOTION_CONFIG_DB_ID — run pnpm run setup first'),
  NOTION_WATCHLIST_DB_ID: z.string().min(1, 'Missing NOTION_WATCHLIST_DB_ID — run pnpm run setup first'),
  NOTION_RISK_DASHBOARD_DB_ID: z.string().min(1, 'Missing NOTION_RISK_DASHBOARD_DB_ID — run pnpm run setup first'),
  NOTION_POSITIONS_DB_ID: z.string().min(1, 'Missing NOTION_POSITIONS_DB_ID — run pnpm run setup first'),
  NOTION_ALERT_LOG_DB_ID: z.string().min(1, 'Missing NOTION_ALERT_LOG_DB_ID — run pnpm run setup first'),
  NOTION_DIGESTS_PAGE_ID: z.string().min(1, 'Missing NOTION_DIGESTS_PAGE_ID — run pnpm run setup first'),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  • ${i.message}`).join('\n');
    throw new Error(`Configuration errors:\n${errors}`);
  }
  const data = result.data;

  // Derive network defaults from NETWORK_MODE if not explicitly set
  if (!data.ETH_RPC_URL) {
    data.ETH_RPC_URL = data.NETWORK_MODE === 'testnet'
      ? 'https://rpc.sepolia.org'
      : 'https://eth.llamarpc.com';
  }

  return data;
}

export const env = parseEnv();

export function requireDbIds() {
  const result = fullEnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  • ${i.message}`).join('\n');
    throw new Error(`Missing DB IDs — run pnpm run setup first:\n${errors}`);
  }
  return result.data;
}

export type Env = z.infer<typeof envSchema>;
export type FullEnv = z.infer<typeof fullEnvSchema>;
