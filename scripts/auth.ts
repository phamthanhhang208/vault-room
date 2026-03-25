/**
 * Quick OAuth helper for Notion MCP.
 * 
 * Usage:
 *   1. Create a public integration at https://www.notion.so/profile/integrations
 *   2. Set redirect URI to: http://localhost:3000/callback
 *   3. Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET in .env
 *   4. Run: pnpm tsx scripts/auth.ts
 *   5. Open the URL printed, authorize, paste the redirect URL back
 */

import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET in .env first');
  console.log('\n1. Go to https://www.notion.so/profile/integrations');
  console.log('2. Create a Public integration');
  console.log('3. Set redirect URI to: http://localhost:3000/callback');
  console.log('4. Copy Client ID and Client Secret to .env');
  process.exit(1);
}

const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&owner=user`;

console.log('\n🔐 Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n⏳ Waiting for callback on http://localhost:3000/callback ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:3000`);
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('No code received');
    return;
  }

  console.log('📨 Received auth code, exchanging for token...');

  // Exchange code for token
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await tokenRes.json() as any;

  if (data.access_token) {
    console.log('\n✅ SUCCESS! Add this to your .env:\n');
    console.log(`NOTION_ACCESS_TOKEN=${data.access_token}`);
    if (data.refresh_token) {
      console.log(`NOTION_REFRESH_TOKEN=${data.refresh_token}`);
    }
    console.log(`\nWorkspace: ${data.workspace_name || 'unknown'}`);
    console.log(`Bot ID: ${data.bot_id || 'unknown'}`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>✅ Authorized!</h1><p>You can close this tab. Check your terminal for the token.</p>');
  } else {
    console.error('\n❌ Token exchange failed:', data);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Failed</h1><pre>${JSON.stringify(data, null, 2)}</pre>`);
  }

  server.close();
  setTimeout(() => process.exit(0), 500);
});

server.listen(3000);
