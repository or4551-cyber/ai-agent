import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.ai-agent-google-token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
];

let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3002}/api/google/callback`;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function getOAuth2Client(): InstanceType<typeof google.auth.OAuth2> | null {
  if (oauth2Client) return oauth2Client;

  const creds = getCredentials();
  if (!creds) return null;

  oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);

  // Load saved token
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oauth2Client.setCredentials(token);

      // Auto-refresh token
      oauth2Client.on('tokens', (tokens) => {
        const existing = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) : {};
        const merged = { ...existing, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log('[GOOGLE] Token refreshed and saved');
      });

      console.log('[GOOGLE] Loaded saved token');
    } catch (err) {
      console.error('[GOOGLE] Failed to load token:', (err as Error).message);
    }
  }

  return oauth2Client;
}

export function getAuthUrl(): string | null {
  const creds = getCredentials();
  if (!creds) return null;

  const client = getOAuth2Client();
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function handleCallback(code: string): Promise<boolean> {
  const client = getOAuth2Client();
  if (!client) return false;

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    // Setup auto-refresh
    client.on('tokens', (newTokens) => {
      const existing = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) : {};
      const merged = { ...existing, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
      console.log('[GOOGLE] Token auto-refreshed');
    });

    console.log('[GOOGLE] OAuth tokens saved successfully');
    return true;
  } catch (err) {
    console.error('[GOOGLE] Token exchange failed:', (err as Error).message);
    return false;
  }
}

export function isAuthenticated(): boolean {
  const client = getOAuth2Client();
  if (!client) return false;
  const creds = client.credentials;
  return !!(creds && creds.access_token);
}

export function getGoogleStatus(): { configured: boolean; authenticated: boolean; authUrl: string | null } {
  const creds = getCredentials();
  const configured = !!creds;
  const authenticated = isAuthenticated();
  const authUrl = !authenticated ? getAuthUrl() : null;
  return { configured, authenticated, authUrl };
}
