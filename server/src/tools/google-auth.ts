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

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

let cachedToken: TokenData | null = null;

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3002}/api/google/callback`;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

function loadToken(): TokenData | null {
  if (cachedToken) return cachedToken;
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    cachedToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    console.log('[GOOGLE] Loaded saved token');
    return cachedToken;
  } catch { return null; }
}

function saveToken(token: TokenData) {
  const existing = loadToken() || {} as TokenData;
  cachedToken = { ...existing, ...token };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(cachedToken, null, 2));
}

async function refreshAccessToken(): Promise<string | null> {
  const creds = getCredentials();
  const token = loadToken();
  if (!creds || !token?.refresh_token) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json() as any;
    if (data.access_token) {
      saveToken({ ...token, access_token: data.access_token, expiry_date: Date.now() + (data.expires_in || 3600) * 1000 });
      console.log('[GOOGLE] Token refreshed');
      return data.access_token;
    }
    return null;
  } catch (err) {
    console.error('[GOOGLE] Refresh failed:', (err as Error).message);
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const token = loadToken();
  if (!token?.access_token) return null;
  if (token.expiry_date && Date.now() > token.expiry_date - 300000) {
    return refreshAccessToken();
  }
  return token.access_token;
}

export async function googleFetch(url: string, options?: RequestInit): Promise<any> {
  let accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Google not connected. Visit /api/google/auth');
  let res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  if (res.status === 401) {
    accessToken = await refreshAccessToken();
    if (!accessToken) throw new Error('Google token expired. Re-auth at /api/google/auth');
    res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...options?.headers },
    });
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: { message: res.statusText } })) as any;
    throw new Error(errData.error?.message || res.statusText);
  }
  return res.json();
}

export function getAuthUrl(): string | null {
  const creds = getCredentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(code: string): Promise<boolean> {
  const creds = getCredentials();
  if (!creds) return false;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: creds.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await res.json() as any;
    console.log('[GOOGLE] Token response status:', res.status);
    if (data.error) {
      console.error('[GOOGLE] Token error:', data.error, data.error_description);
    }
    if (!data.access_token) return false;
    saveToken({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    });
    console.log('[GOOGLE] OAuth tokens saved successfully');
    return true;
  } catch (err) {
    console.error('[GOOGLE] Token exchange failed:', (err as Error).message);
    return false;
  }
}

export function isAuthenticated(): boolean {
  const token = loadToken();
  return !!(token && token.access_token);
}

export function getGoogleStatus(): { configured: boolean; authenticated: boolean; authUrl: string | null } {
  const creds = getCredentials();
  const configured = !!creds;
  const authenticated = isAuthenticated();
  const authUrl = !authenticated ? getAuthUrl() : null;
  return { configured, authenticated, authUrl };
}
