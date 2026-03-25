/**
 * One-time OAuth flow to authenticate with Notion's hosted MCP server.
 * Run this once, then store the tokens for use by the app.
 */
import { randomBytes, createHash } from 'crypto';
import http from 'http';
import { URL, URLSearchParams } from 'url';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const MCP_SERVER_URL = 'https://mcp.notion.com/mcp';
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// --- Helpers ---
function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash('sha256').update(verifier).digest());
}

function generateState(): string {
  return randomBytes(32).toString('hex');
}

// --- Step 1: OAuth Discovery ---
async function discoverOAuthMetadata() {
  const url = new URL(MCP_SERVER_URL);

  // RFC 9470 - Protected Resource Metadata
  const prUrl = `${url.origin}/.well-known/oauth-protected-resource`;
  console.log(`📡 Fetching protected resource metadata from ${prUrl}...`);
  const prResp = await fetch(prUrl);
  if (!prResp.ok) throw new Error(`Failed: ${prResp.status}`);
  const prData = await prResp.json() as any;

  const authServers = prData.authorization_servers;
  if (!Array.isArray(authServers) || authServers.length === 0) {
    throw new Error('No authorization servers found');
  }
  const authServerUrl = authServers[0];
  console.log(`🔑 Authorization server: ${authServerUrl}`);

  // RFC 8414 - Authorization Server Metadata
  const metaUrl = `${authServerUrl}/.well-known/oauth-authorization-server`;
  console.log(`📡 Fetching auth server metadata from ${metaUrl}...`);
  const metaResp = await fetch(metaUrl);
  if (!metaResp.ok) throw new Error(`Failed: ${metaResp.status}`);
  const metadata = await metaResp.json() as any;

  console.log(`✅ Found endpoints:`);
  console.log(`   Authorization: ${metadata.authorization_endpoint}`);
  console.log(`   Token: ${metadata.token_endpoint}`);
  console.log(`   Registration: ${metadata.registration_endpoint || 'N/A'}`);

  return metadata;
}

// --- Step 2: Dynamic Client Registration ---
async function registerClient(metadata: any) {
  if (!metadata.registration_endpoint) {
    throw new Error('Server does not support dynamic client registration');
  }

  console.log(`\n📝 Registering client...`);
  const resp = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_name: 'VaultRoom DeFi Agent',
      client_uri: 'https://github.com/phamthanhhang208/vault-room',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Registration failed: ${resp.status} - ${body}`);
  }

  const creds = await resp.json() as any;
  console.log(`✅ Client registered! client_id: ${creds.client_id}`);
  return creds;
}

// --- Step 3-5: Auth flow with local callback server ---
async function doAuthFlow(metadata: any, clientId: string) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: '',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });

  const authUrl = `${metadata.authorization_endpoint}?${params.toString()}`;

  return new Promise<any>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);

      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400);
        res.end(`Error: ${error} - ${reqUrl.searchParams.get('error_description')}`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400);
        res.end('State mismatch!');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      // Exchange code for tokens
      console.log(`\n🔄 Exchanging authorization code for tokens...`);
      try {
        const tokenResp = await fetch(metadata.token_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code!,
            redirect_uri: REDIRECT_URI,
            client_id: clientId,
            code_verifier: codeVerifier,
          }).toString()
        });

        if (!tokenResp.ok) {
          const errBody = await tokenResp.text();
          throw new Error(`Token exchange failed: ${tokenResp.status} - ${errBody}`);
        }

        const tokens = await tokenResp.json();
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>✅ VaultRoom authorized!</h1><p>You can close this tab.</p></body></html>');
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end(`Token exchange failed: ${err}`);
        server.close();
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`\n🌐 Callback server listening on port ${REDIRECT_PORT}`);
      console.log(`\n👉 Open this URL in your browser:\n`);
      console.log(authUrl);
      console.log(`\nWaiting for authorization...`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out (5 min)'));
    }, 300000);
  });
}

// --- Main ---
async function main() {
  console.log('🚀 VaultRoom — Notion MCP OAuth Setup\n');

  // Step 1: Discover
  const metadata = await discoverOAuthMetadata();

  // Step 2: Register client
  const creds = await registerClient(metadata);

  // Step 3-5: Auth flow
  const tokens = await doAuthFlow(metadata, creds.client_id);

  console.log(`\n✅ Authentication successful!`);
  console.log(`   Access token: ${(tokens.access_token as string)?.slice(0, 20)}...`);
  console.log(`   Refresh token: ${tokens.refresh_token ? 'present' : 'none'}`);

  // Save to .env
  const envPath = path.resolve(process.cwd(), '.env');
  let env = fs.readFileSync(envPath, 'utf-8');

  // Save MCP-specific tokens
  const mcpVars = {
    MCP_ACCESS_TOKEN: tokens.access_token,
    MCP_REFRESH_TOKEN: tokens.refresh_token || '',
    MCP_CLIENT_ID: creds.client_id,
    MCP_CLIENT_SECRET: creds.client_secret || '',
    MCP_TOKEN_ENDPOINT: metadata.token_endpoint,
  };

  for (const [key, val] of Object.entries(mcpVars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(env)) {
      env = env.replace(regex, `${key}=${val}`);
    } else {
      env += `\n${key}=${val}`;
    }
  }

  fs.writeFileSync(envPath, env);
  console.log(`\n💾 Tokens saved to .env`);
  console.log(`\nYou can now run the app — it will use these MCP tokens.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
