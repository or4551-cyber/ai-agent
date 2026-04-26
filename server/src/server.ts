import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { ClaudeAgent } from './agent/claude-agent';
import { WSResponse } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ObserverService } from './observer/service';
import { generateBriefing } from './services/briefing';
import { tryOfflineCommand } from './agent/offline-commands';
import { LocalLLM } from './agent/local-llm';
import { getAuthUrl, handleCallback, getGoogleStatus } from './tools/google-auth';
import { ProactiveAgentService } from './services/proactive-agent';
import { VoiceDaemon } from './services/voice-daemon';
import { PersonalityEngine } from './services/personality-engine';
import { RemoteBackend } from './services/remote-backend';
import { DeviceSyncService } from './services/device-sync';
import {
  reminderService,
  routineService,
  storageScanner,
  backupService,
  favoritesService,
  userProfileService,
  conversationHistoryService as conversationHistory,
  smartAlertsService as smartAlerts,
} from './services/registry';

dotenv.config();

// ===== CRASH PROTECTION =====
// Prevent unhandled errors from killing the server
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception (server kept alive):', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection (server kept alive):', reason);
});

// Start background services (singletons live in services/registry.ts)
let observer: ObserverService | null = null;
reminderService.start();
routineService.start();
smartAlerts.start();

if (process.env.ANTHROPIC_API_KEY) {
  observer = new ObserverService(process.env.ANTHROPIC_API_KEY);
  observer.start();
}

const proactiveAgent = new ProactiveAgentService();
proactiveAgent.start();
const voiceDaemon = new VoiceDaemon();
const personalityEngine = new PersonalityEngine(process.env.ANTHROPIC_API_KEY);
const remoteBackend = new RemoteBackend();

const localLLM = new LocalLLM();

const app = express();
const PORT = Number(process.env.PORT) || 3002;
let deviceSync: DeviceSyncService | null = null;
try {
  deviceSync = new DeviceSyncService(PORT);
  deviceSync.start();
} catch (err) {
  console.error('[DeviceSync] Failed to start (server continues):', (err as Error).message);
}
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token';
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'web', 'out');

// Path-traversal protection: only allow file ops inside these roots
const ALLOWED_FILE_ROOTS = [
  '/storage/emulated/0',
  '/sdcard',
  process.env.HOME || '/data/data/com.termux/files/home',
  '/data/data/com.termux/files/home',
];
const FILE_BLACKLIST_PATTERNS = [
  /\/\.ssh(\/|$)/,
  /\/\.gnupg(\/|$)/,
  /\/\.env$/,
  /\/\.env\./,
  /\/private\.key/i,
  /\/credentials\.json$/i,
];

function isPathAllowed(targetPath: string): { ok: boolean; reason?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { ok: false, reason: 'Invalid path' };
  }
  let resolved: string;
  try {
    resolved = path.resolve(targetPath);
  } catch {
    return { ok: false, reason: 'Path resolution failed' };
  }
  // Block blacklisted paths
  for (const pattern of FILE_BLACKLIST_PATTERNS) {
    if (pattern.test(resolved)) {
      return { ok: false, reason: 'Path blocked by security policy' };
    }
  }
  // Must be under one of the allowed roots
  const inAllowed = ALLOWED_FILE_ROOTS.some(root => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep) || resolved.startsWith(r + '/');
  });
  if (!inAllowed) {
    return { ok: false, reason: `Path outside allowed roots (${ALLOWED_FILE_ROOTS.join(', ')})` };
  }
  return { ok: true };
}

// Security notice: warn if using default token
if (AUTH_TOKEN === 'dev-token') {
  console.warn('[SECURITY] ⚠️  AUTH_TOKEN=dev-token — לשיפור אבטחה, הגדר טוקן ייחודי ב-.env');
}

app.use(cors());
app.use(express.json());

// ===== AUTH MIDDLEWARE =====
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ===== RATE LIMITING (in-memory token bucket) =====
interface RateBucket { tokens: number; lastRefill: number; }
const rateBuckets = new Map<string, RateBucket>();

function makeRateLimit(maxPerMinute: number) {
  const refillRate = maxPerMinute / 60000; // tokens per ms
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const key = `${ip}:${req.path.split('/').slice(0, 4).join('/')}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxPerMinute, lastRefill: now };
      rateBuckets.set(key, bucket);
    }
    // Refill
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(maxPerMinute, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;
    if (bucket.tokens < 1) {
      res.status(429).json({ error: 'Rate limit exceeded — try again in a moment' });
      return;
    }
    bucket.tokens -= 1;
    next();
  };
}

// Periodic cleanup so the map doesn't grow indefinitely
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets.entries()) {
    if (now - b.lastRefill > 5 * 60 * 1000) rateBuckets.delete(k);
  }
}, 60 * 1000).unref?.();

const generalLimit = makeRateLimit(120);   // 120/min for normal APIs
const writeLimit = makeRateLimit(30);      // 30/min for write/delete APIs

app.use('/api', generalLimit);

// ===== REST ENDPOINTS =====

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/api/tools', authMiddleware, (_req, res) => {
  const { getToolDefinitions } = require('./tools/definitions');
  res.json({ tools: getToolDefinitions() });
});

// ===== GOOGLE OAUTH =====

app.get('/api/google/auth', (_req, res) => {
  const url = getAuthUrl();
  if (!url) {
    res.status(500).json({ error: 'Google not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    return;
  }
  res.redirect(url);
});

app.get('/api/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;
  console.log('[GOOGLE CALLBACK] code:', code ? 'present' : 'missing', 'error:', error || 'none');
  if (error) {
    console.error('[GOOGLE CALLBACK] OAuth error:', error);
    res.status(400).send(`<html dir="rtl"><body style="background:#09090b;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>❌ שגיאה בחיבור Google</h1><p>${error}</p></body></html>`);
    return;
  }
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }
  try {
    const success = await handleCallback(code);
    if (success) {
      res.send(`<html dir="rtl"><body style="background:#09090b;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>✅ Google מחובר בהצלחה!</h1><p>אפשר לסגור את החלון הזה. הסוכן מחובר עכשיו ל-Gmail, Drive, Tasks, Calendar ו-Contacts.</p></body></html>`);
    } else {
      res.status(500).send(`<html dir="rtl"><body style="background:#09090b;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>❌ שגיאה בחיבור Google</h1><p>Token exchange failed. Check server logs.</p></body></html>`);
    }
  } catch (err) {
    console.error('[GOOGLE CALLBACK] Exception:', err);
    res.status(500).send(`<html dir="rtl"><body style="background:#09090b;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>❌ שגיאה</h1><p>${(err as Error).message}</p></body></html>`);
  }
});

app.get('/api/google/status', authMiddleware, (_req, res) => {
  res.json(getGoogleStatus());
});

// ===== BACKUP API =====

app.post('/api/backup/create', authMiddleware, async (_req, res) => {
  try {
    const result = await backupService.createBackup();
    res.json({ message: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/backup/list', authMiddleware, (_req, res) => {
  res.json({ backups: backupService.listBackups() });
});

app.post('/api/backup/restore', authMiddleware, async (req, res) => {
  try {
    const result = await backupService.restoreBackup(req.body?.backup_id);
    res.json({ message: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ===== PROACTIVE AGENT API =====

app.get('/api/proactive-actions', authMiddleware, (_req, res) => {
  res.json({ actions: proactiveAgent.getActions() });
});

app.post('/api/proactive-actions/:id/dismiss', authMiddleware, (req, res) => {
  proactiveAgent.dismiss(req.params.id as string);
  res.json({ ok: true });
});

// ===== PROACTIVE ALERTS API =====

app.get('/api/proactive-alerts', authMiddleware, async (_req, res) => {
  const alerts: { id: string; type: string; icon: string; text: string; priority: 'high' | 'medium' | 'low' }[] = [];

  try {
    // Battery check
    const { getBattery, getNotifications, calendarList } = require('./tools/termux-api');
    try {
      const batteryRaw = await getBattery();
      const match = batteryRaw.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1]);
        if (pct <= 15) alerts.push({ id: 'bat', type: 'battery', icon: '🪫', text: `סוללה ${pct}% — כדאי לטעון עכשיו!`, priority: 'high' });
        else if (pct <= 25) alerts.push({ id: 'bat', type: 'battery', icon: '🔋', text: `סוללה ${pct}% — שים לב`, priority: 'medium' });
      }
    } catch {}

    // Calendar — events in next 30 minutes
    try {
      const calRaw = await calendarList(1);
      if (calRaw && !calRaw.includes('אין אירועים') && !calRaw.includes('לא הצלחתי')) {
        const lines = calRaw.split('\n').filter((l: string) => l.includes('📅'));
        const now = Date.now();
        for (const line of lines.slice(0, 3)) {
          const timeMatch = line.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            const today = new Date();
            today.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
            const diff = today.getTime() - now;
            if (diff > 0 && diff < 30 * 60 * 1000) {
              alerts.push({ id: `cal-${timeMatch[0]}`, type: 'calendar', icon: '📅', text: `פגישה בעוד ${Math.round(diff / 60000)} דקות: ${line.replace(/📅\s*/, '').trim()}`, priority: 'high' });
            }
          }
        }
      }
    } catch {}

    // WhatsApp unread
    try {
      const notifRaw = await getNotifications();
      if (notifRaw) {
        const waMatch = notifRaw.match(/(\d+)\s*הודעות?\s*(?:חדשות?|from)/i) || notifRaw.match(/WhatsApp.*?(\d+)/);
        const waLines = notifRaw.split('\n').filter((l: string) => l.toLowerCase().includes('whatsapp'));
        if (waLines.length > 0) {
          alerts.push({ id: 'wa', type: 'whatsapp', icon: '💬', text: `${waLines.length} הודעות ווטסאפ חדשות`, priority: 'medium' });
        }
      }
    } catch {}

    // Storage check — using disk free
    try {
      const { runCommand } = require('./tools/terminal');
      const dfRaw = await runCommand('df /storage/emulated/0 2>/dev/null | tail -1', undefined, 5000);
      const parts = (dfRaw || '').trim().split(/\s+/);
      if (parts.length >= 5) {
        const usePct = parseInt(parts[4].replace('%', ''));
        if (usePct >= 90) alerts.push({ id: 'storage', type: 'storage', icon: '💾', text: `אחסון כמעט מלא (${usePct}%)`, priority: 'high' });
        else if (usePct >= 85) alerts.push({ id: 'storage', type: 'storage', icon: '💾', text: `אחסון ${usePct}% — שים לב`, priority: 'medium' });
      }
    } catch {}
  } catch (err) {
    console.error('[PROACTIVE] Error:', (err as Error).message);
  }

  res.json({ alerts, timestamp: Date.now() });
});

// ===== BRIEFING API =====

app.get('/api/briefing', authMiddleware, (_req, res) => {
  res.json(generateBriefing(reminderService));
});

// ===== REMINDERS API =====

app.get('/api/reminders', authMiddleware, (req, res) => {
  const all = req.query?.all === 'true';
  res.json({ reminders: reminderService.list(all) });
});

app.post('/api/reminders', authMiddleware, (req, res) => {
  const { text, dueAt } = req.body;
  if (!text || !dueAt) { res.status(400).json({ error: 'text and dueAt required' }); return; }
  const reminder = reminderService.add(text, new Date(dueAt));
  res.json(reminder);
});

app.post('/api/reminders/:id/complete', authMiddleware, (req, res) => {
  reminderService.complete(req.params.id as string);
  res.json({ success: true });
});

app.delete('/api/reminders/:id', authMiddleware, (req, res) => {
  reminderService.delete(req.params.id as string);
  res.json({ success: true });
});

// ===== ROUTINES API =====

app.get('/api/routines', authMiddleware, (_req, res) => {
  res.json({ routines: routineService.list() });
});

app.post('/api/routines', authMiddleware, (req, res) => {
  const { name, schedule, action } = req.body;
  if (!name || !schedule || !action) { res.status(400).json({ error: 'name, schedule, action required' }); return; }
  const routine = routineService.add(name, schedule, action);
  res.json(routine);
});

app.post('/api/routines/:id/toggle', authMiddleware, (req, res) => {
  routineService.toggle(req.params.id as string);
  res.json({ success: true });
});

app.delete('/api/routines/:id', authMiddleware, (req, res) => {
  routineService.remove(req.params.id as string);
  res.json({ success: true });
});

// ===== DEVICE SYNC API =====
// These endpoints are used by peer devices — no auth required for identity/manifest
// (they run on the local network only)

app.get('/api/device-sync/identity', (_req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  res.json(deviceSync.getIdentity());
});

app.get('/api/device-sync/manifest', (_req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  res.json(deviceSync.getManifest());
});

app.get('/api/device-sync/file/:name', (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const content = deviceSync.getFileContent(req.params.name);
  if (!content) { res.status(404).json({ error: 'File not found' }); return; }
  res.type('application/json').send(content);
});

// Cross-device message inbox (in-memory, last 50 messages)
const deviceInbox: Array<{ id: string; from: string; fromName: string; fromType: string; type: string; payload: Record<string, unknown>; timestamp: number; read: boolean }> = [];

app.post('/api/device-sync/message', express.json(), (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const msg = req.body;
  deviceSync.handleIncomingMessage(msg);

  // Store in inbox
  const peer = deviceSync.getPeers().find(p => p.id === msg.from);
  deviceInbox.unshift({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from: msg.from,
    fromName: peer?.name || msg.from,
    fromType: peer?.type || 'unknown',
    type: msg.type,
    payload: msg.payload || {},
    timestamp: msg.timestamp || Date.now(),
    read: false,
  });
  // Keep only last 50
  while (deviceInbox.length > 50) deviceInbox.pop();

  res.json({ ok: true });
});

app.get('/api/device-sync/inbox', authMiddleware, (_req, res) => {
  const unread = deviceInbox.filter(m => !m.read).length;
  res.json({ messages: deviceInbox.slice(0, 20), unread });
});

app.post('/api/device-sync/inbox/read', authMiddleware, (_req, res) => {
  for (const m of deviceInbox) m.read = true;
  res.json({ ok: true });
});

// Auth-protected sync management endpoints
app.get('/api/device-sync/status', authMiddleware, (_req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  res.json(deviceSync.getStatus());
});

app.post('/api/device-sync/add-peer', authMiddleware, async (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const { ip, port } = req.body;
  if (!ip) { res.status(400).json({ error: 'ip required' }); return; }
  const peer = await deviceSync.addPeer(ip, port || 3002);
  if (peer) {
    res.json({ success: true, peer });
  } else {
    res.status(404).json({ error: 'Could not reach peer at ' + ip });
  }
});

app.post('/api/device-sync/remove-peer', authMiddleware, (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const { id } = req.body;
  res.json({ success: deviceSync.removePeer(id) });
});

app.post('/api/device-sync/send', authMiddleware, async (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const { peerId, type, payload } = req.body;
  const ok = await deviceSync.sendToPeer(peerId, type || 'notification', payload || {});
  res.json({ success: ok });
});

app.post('/api/device-sync/set-name', authMiddleware, (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  deviceSync.setDeviceName(name);
  res.json({ success: true, identity: deviceSync.getIdentity() });
});

// ===== REMOTE DEVICE CONTROL =====

// Quick status endpoint for remote queries (lightweight, no auth for peer access)
app.get('/api/device-sync/quick-status', (_req, res) => {
  const { execSync } = require('child_process');
  const status: Record<string, unknown> = { timestamp: Date.now() };

  // Battery
  try {
    const bat = JSON.parse(execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString());
    status.battery = { percentage: bat.percentage, status: bat.status, temperature: bat.temperature };
  } catch { status.battery = null; }

  // Health
  try {
    const monitor = proactiveAgent.getHealthMonitor();
    status.health = monitor.getHealthStatus();
  } catch { status.health = null; }

  // Notifications count
  try {
    const notifs = JSON.parse(execSync('termux-notification-list 2>/dev/null', { timeout: 5000 }).toString());
    status.notifications = { count: Array.isArray(notifs) ? notifs.length : 0 };
  } catch { status.notifications = null; }

  // Device identity
  if (deviceSync) {
    status.device = deviceSync.getIdentity();
  }

  res.json(status);
});

// Proxy: forward an API call to a peer device and return the result
app.post('/api/device-sync/proxy', authMiddleware, async (req, res) => {
  if (!deviceSync) { res.status(503).json({ error: 'DeviceSync not available' }); return; }
  const { peerId, path: apiPath, method = 'GET', body } = req.body;
  if (!peerId || !apiPath) { res.status(400).json({ error: 'peerId and path required' }); return; }

  const peer = deviceSync.getPeers().find(p => p.id === peerId);
  if (!peer?.online || !peer.ip) { res.status(404).json({ error: 'Peer not online' }); return; }

  const url = `http://${peer.ip}:${peer.port}${apiPath}`;

  try {
    const http = require('http');
    const result = await new Promise<string>((resolve, reject) => {
      const options: any = {
        hostname: peer.ip,
        port: peer.port,
        path: apiPath,
        method: method.toUpperCase(),
        timeout: 10000,
        headers: { 'Content-Type': 'application/json', 'X-Merlin-Device-Id': deviceSync!.getIdentity().id },
      };

      const proxyReq = http.request(options, (proxyRes: any) => {
        let data = '';
        proxyRes.on('data', (chunk: string) => data += chunk);
        proxyRes.on('end', () => resolve(data));
      });

      proxyReq.on('error', reject);
      proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('timeout')); });

      if (body && method.toUpperCase() !== 'GET') {
        proxyReq.write(JSON.stringify(body));
      }
      proxyReq.end();
    });

    try {
      res.json(JSON.parse(result));
    } catch {
      res.json({ raw: result });
    }
  } catch (err: any) {
    res.status(502).json({ error: `Proxy failed: ${err.message}` });
  }
});

// ===== OBSERVER API =====

app.get('/api/observer/status', authMiddleware, (_req, res) => {
  res.json(observer ? observer.getStatus() : { running: false });
});

app.get('/api/observer/suggestions', authMiddleware, (_req, res) => {
  res.json({ suggestions: observer ? observer.getSuggestions() : [] });
});

app.get('/api/observer/analysis', authMiddleware, (_req, res) => {
  res.json(observer ? observer.getAnalysis() : { patterns: [], stats: {} });
});

app.post('/api/observer/digest', authMiddleware, async (_req, res) => {
  if (!observer) {
    res.status(400).json({ suggestions: [], error: 'הצופה לא פעיל. ודא ש-ANTHROPIC_API_KEY מוגדר ב-.env' });
    return;
  }
  try {
    const snapCount = observer.getSnapshotCount();
    console.log(`[Observer] Manual digest requested. Snapshots: ${snapCount}`);
    if (snapCount < 3) {
      res.json({ suggestions: [], error: `רק ${snapCount} דגימות — צריך לפחות 3` });
      return;
    }
    const suggestions = await observer.runDigest();
    console.log(`[Observer] Digest returned ${suggestions.length} suggestions`);
    res.json({ suggestions });
  } catch (err) {
    console.error('[Observer] Digest error:', (err as Error).message);
    res.json({ suggestions: [], error: `שגיאה: ${(err as Error).message}` });
  }
});

// ===== USER PROFILE API =====

app.get('/api/profile', authMiddleware, (_req, res) => {
  res.json(userProfileService.getProfile());
});

app.post('/api/profile/preference', authMiddleware, (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    res.status(400).json({ error: 'key and value required' });
    return;
  }
  userProfileService.setPreference(key, value, 'explicit', 1.0);
  res.json({ success: true });
});

app.post('/api/profile/name', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  userProfileService.setName(name);
  res.json({ success: true });
});

// ===== STORAGE SCANNER API =====

app.get('/api/storage/status', authMiddleware, (_req, res) => {
  res.json({
    scanning: storageScanner.isScanning(),
    lastScan: storageScanner.getLastResult()?.timestamp || null,
  });
});

app.get('/api/storage/last-scan', authMiddleware, (_req, res) => {
  const result = storageScanner.getLastResult();
  if (!result) {
    res.json({ result: null });
    return;
  }
  res.json({ result });
});

app.post('/api/storage/scan', authMiddleware, async (_req, res) => {
  if (storageScanner.isScanning()) {
    res.status(409).json({ error: 'Scan already in progress' });
    return;
  }
  const result = await storageScanner.scan();
  res.json({ result });
});

app.post('/api/storage/clear-cache', authMiddleware, (_req, res) => {
  const { freedMb } = storageScanner.clearCache();
  res.json({ freedMb });
});

app.post('/api/storage/delete-empty', authMiddleware, (_req, res) => {
  const count = storageScanner.deleteEmptyFolders();
  res.json({ deleted: count });
});

app.post('/api/storage/delete-files', authMiddleware, (req, res) => {
  const { paths } = req.body;
  if (!Array.isArray(paths)) {
    res.status(400).json({ error: 'paths array required' });
    return;
  }
  const result = storageScanner.deleteFiles(paths);
  res.json(result);
});

// ===== SMART ALERTS API =====

app.get('/api/alerts', authMiddleware, (req, res) => {
  const unread = req.query.unread === 'true';
  res.json({ alerts: smartAlerts.getAlerts(unread), unreadCount: smartAlerts.getUnreadCount() });
});

app.post('/api/alerts/read/:id', authMiddleware, (req, res) => {
  smartAlerts.markRead(req.params.id as string);
  res.json({ success: true });
});

app.post('/api/alerts/read-all', authMiddleware, (_req, res) => {
  smartAlerts.markAllRead();
  res.json({ success: true });
});

// ===== HEALTH & PROXIMITY API =====

app.get('/api/health', authMiddleware, (_req, res) => {
  const monitor = proactiveAgent.getHealthMonitor();
  // Force a fresh reading so the UI always gets latest data
  try { monitor.forceCollect(); } catch {}
  const health = monitor.getHealthStatus();
  res.json(health);
});

app.post('/api/health/push', authMiddleware, (req, res) => {
  const { heartRate, steps, isMoving } = req.body;
  proactiveAgent.getHealthMonitor().pushReading({ heartRate, steps, isMoving });
  res.json({ success: true });
});

app.get('/api/health/sensors', authMiddleware, (_req, res) => {
  const sensors = proactiveAgent.getHealthMonitor().getAvailableSensors();
  res.json({ sensors });
});

app.get('/api/health/debug', authMiddleware, (_req, res) => {
  const monitor = proactiveAgent.getHealthMonitor();
  const status = monitor.getHealthStatus();
  const sensors = monitor.getAvailableSensors();
  const readings = monitor.getReadings().slice(-5);
  const hasSamsungSensors = sensors.some((s: string) => s.toLowerCase().includes('heart') || s.toLowerCase().includes('step') || s.toLowerCase().includes('ppg'));
  res.json({
    status,
    sensorCount: sensors.length,
    hasSamsungSensors,
    recentReadings: readings,
    tip: !status.currentHeartRate && !status.todaySteps
      ? 'No health data found. Make sure Samsung Health notifications are enabled and the watch is synced.'
      : 'Health data is being read successfully.',
  });
});

app.get('/api/health/notifications', authMiddleware, (_req, res) => {
  const monitor = proactiveAgent.getHealthMonitor();
  res.json(monitor.debugNotifications());
});

app.get('/api/proximity', authMiddleware, (_req, res) => {
  const proximity = proactiveAgent.getDeviceScanner().getProximityStatus();
  res.json(proximity);
});

app.get('/api/proximity/scan', authMiddleware, (_req, res) => {
  const latest = proactiveAgent.getDeviceScanner().getLatestScan();
  res.json({ scan: latest, totalScans: proactiveAgent.getDeviceScanner().getScanCount() });
});

// ===== VOICE DAEMON API =====

app.get('/api/voice-daemon/status', authMiddleware, (_req, res) => {
  res.json(voiceDaemon.getStatus());
});

app.post('/api/voice-daemon/start', authMiddleware, async (req, res) => {
  const mode = (req.body?.mode as string) || 'wake_word';
  const result = await voiceDaemon.start(mode as any);
  res.json({ message: result, status: voiceDaemon.getStatus() });
});

app.post('/api/voice-daemon/stop', authMiddleware, (_req, res) => {
  const result = voiceDaemon.stop();
  res.json({ message: result, status: voiceDaemon.getStatus() });
});

app.post('/api/voice-daemon/activate', authMiddleware, (_req, res) => {
  voiceDaemon.setMode('active');
  res.json({ message: 'Switched to active mode', status: voiceDaemon.getStatus() });
});

app.post('/api/voice-daemon/wake', authMiddleware, (_req, res) => {
  voiceDaemon.setMode('wake_word');
  res.json({ message: 'Switched to wake word mode', status: voiceDaemon.getStatus() });
});

// ===== FAVORITES API =====

app.get('/api/favorites', authMiddleware, (req, res) => {
  const type = req.query.type as string | undefined;
  if (type) {
    res.json({ items: favoritesService.getByType(type as any) });
  } else {
    res.json(favoritesService.getAll());
  }
});

app.get('/api/favorites/stats', authMiddleware, (_req, res) => {
  res.json(favoritesService.getStats());
});

app.post('/api/favorites/vip', authMiddleware, (req, res) => {
  const vip = favoritesService.addVip(req.body);
  res.json(vip);
});

app.put('/api/favorites/vip/:id', authMiddleware, (req, res) => {
  const updated = favoritesService.updateVip(req.params.id as string, req.body);
  if (!updated) { res.status(404).json({ error: 'VIP not found' }); return; }
  res.json(updated);
});

app.delete('/api/favorites/:type/:id', authMiddleware, (req, res) => {
  const type = req.params.type as string;
  const id = req.params.id as string;
  let ok = false;
  switch (type) {
    case 'vip': ok = favoritesService.removeVip(id); break;
    case 'shortcut': ok = favoritesService.removeShortcut(id); break;
    case 'app': ok = favoritesService.removeApp(id); break;
    case 'location': ok = favoritesService.removeLocation(id); break;
  }
  res.json({ success: ok });
});

app.post('/api/favorites/shortcut', authMiddleware, (req, res) => {
  res.json(favoritesService.addShortcut(req.body));
});

app.post('/api/favorites/app', authMiddleware, (req, res) => {
  res.json(favoritesService.addApp(req.body));
});

app.post('/api/favorites/location', authMiddleware, (req, res) => {
  res.json(favoritesService.addLocation(req.body));
});

// ===== PERSONALITY ENGINE API =====

app.get('/api/personality', authMiddleware, (_req, res) => {
  res.json(personalityEngine.getData());
});

app.get('/api/personality/style', authMiddleware, (_req, res) => {
  res.json(personalityEngine.getWritingStyle());
});

app.get('/api/personality/relationships', authMiddleware, (_req, res) => {
  res.json({ relationships: personalityEngine.getRelationships() });
});

app.get('/api/personality/episodes', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({ episodes: personalityEngine.getRecentEpisodes(limit) });
});

app.get('/api/personality/time-patterns', authMiddleware, (_req, res) => {
  res.json(personalityEngine.getTimePatterns());
});

// ===== REMOTE BACKEND API =====

app.get('/api/remote-backend/status', authMiddleware, (_req, res) => {
  res.json(remoteBackend.getStatus());
});

app.get('/api/remote-backend/config', authMiddleware, (_req, res) => {
  res.json(remoteBackend.getConfig());
});

app.post('/api/remote-backend/config', authMiddleware, (req, res) => {
  remoteBackend.saveConfig(req.body);
  res.json({ success: true, config: remoteBackend.getConfig() });
});

app.post('/api/remote-backend/connect', authMiddleware, async (_req, res) => {
  const success = await remoteBackend.connect();
  res.json({ success, status: remoteBackend.getStatus() });
});

app.post('/api/remote-backend/disconnect', authMiddleware, (_req, res) => {
  remoteBackend.disconnect();
  res.json({ success: true, status: remoteBackend.getStatus() });
});

// ===== CONVERSATION HISTORY API =====

app.get('/api/conversations', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;
  res.json(conversationHistory.list(limit, offset));
});

app.get('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = conversationHistory.get(req.params.id as string);
  if (!conv) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(conv);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  conversationHistory.save(req.body);
  res.json({ success: true });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const ok = conversationHistory.delete(req.params.id as string);
  res.json({ success: ok });
});

app.delete('/api/conversations', authMiddleware, (_req, res) => {
  conversationHistory.deleteAll();
  res.json({ success: true });
});

app.get('/api/conversations/:id/export', authQuery, (req, res) => {
  const conv = conversationHistory.get(req.params.id as string);
  if (!conv) { res.status(404).json({ error: 'Not found' }); return; }
  const format = (req.query.format as string) || 'txt';
  if (format === 'txt') {
    let txt = `שיחה: ${conv.title || 'ללא כותרת'}\nתאריך: ${new Date(conv.createdAt).toLocaleString('he-IL')}\n${'─'.repeat(40)}\n\n`;
    for (const msg of conv.messages) {
      const role = msg.role === 'user' ? '👤 אתה' : msg.role === 'assistant' ? '🤖 Merlin' : '⚙️ מערכת';
      txt += `${role}:\n${msg.content}\n\n`;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="conversation-${conv.id}.txt"`);
    res.send(txt);
  } else {
    res.status(400).json({ error: 'Unsupported format. Use txt.' });
  }
});

// ===== DEVICE CONTROL PANEL API =====

function authQuery(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Cache device-stats for 8 seconds to avoid hammering Termux on dashboard refresh
let deviceStatsCache: { data: Record<string, unknown>; ts: number } | null = null;
const DEVICE_STATS_TTL_MS = 8000;

function execAsync(cmd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(cmd, { timeout: timeoutMs }, (_err: any, stdout: string) => {
      resolve(stdout || '');
    });
  });
}

app.get('/api/device-stats', authQuery, async (_req, res) => {
  // Serve from cache if fresh
  if (deviceStatsCache && Date.now() - deviceStatsCache.ts < DEVICE_STATS_TTL_MS) {
    res.json(deviceStatsCache.data);
    return;
  }

  const os = require('os');
  const stats: Record<string, unknown> = {};

  // Run all reads in parallel — 5 cmds * 5s = 25s sequential, ~5s parallel
  const [batRaw, volRaw, brightRaw, wifiRaw, btRaw] = await Promise.all([
    execAsync('termux-battery-status 2>/dev/null', 5000),
    execAsync('termux-volume 2>/dev/null', 3000),
    execAsync('settings get system screen_brightness 2>/dev/null', 2000),
    execAsync('termux-wifi-connectioninfo 2>/dev/null', 3000),
    execAsync('settings get global bluetooth_on 2>/dev/null', 2000),
  ]);

  // Battery
  try {
    const b = JSON.parse(batRaw);
    stats.battery = { level: b.percentage ?? -1, charging: b.status === 'CHARGING', temperature: b.temperature };
  } catch {
    stats.battery = { level: -1, charging: false };
  }

  // Storage (sync but very fast — just stat)
  try {
    const homeDir = process.env.HOME || os.homedir();
    const stat = fs.statfsSync ? fs.statfsSync(homeDir) : null;
    if (stat) {
      const totalMb = Math.round((stat.bsize * stat.blocks) / (1024 * 1024));
      const freeMb = Math.round((stat.bsize * stat.bfree) / (1024 * 1024));
      stats.storage = { totalMb, freeMb, usedMb: totalMb - freeMb };
    } else {
      stats.storage = { totalMb: 0, freeMb: 0, usedMb: 0 };
    }
  } catch {
    stats.storage = { totalMb: 0, freeMb: 0, usedMb: 0 };
  }

  // Volume
  try {
    const volumes = JSON.parse(volRaw);
    const music = volumes.find((v: any) => v.stream === 'music');
    stats.volume = music?.volume ?? 7;
  } catch {
    stats.volume = 7;
  }

  // Brightness
  const val = parseInt((brightRaw || '').trim());
  stats.brightness = isNaN(val) ? 50 : Math.round(val / 255 * 100);

  // WiFi
  try {
    const wifi = JSON.parse(wifiRaw);
    stats.wifi = wifi.supplicant_state === 'COMPLETED' || (wifi.ip && wifi.ip !== '' && wifi.ip !== '<unknown ssid>');
  } catch {
    stats.wifi = false;
  }

  // Bluetooth
  stats.bluetooth = (btRaw || '').trim() === '1';

  stats.flashlight = flashlightOn ?? false;

  deviceStatsCache = { data: stats, ts: Date.now() };
  res.json(stats);
});

// Cached device state (avoids slow reads on every action)
let flashlightOn = false;
let cachedVolume = 7;
let cachedBrightness = 128;
let silentMode = false;

// Non-blocking command runner using child_process.exec
function runAsync(cmd: string): void {
  const { exec } = require('child_process');
  exec(cmd, { timeout: 5000 }, (err: any) => {
    if (err) console.error(`[DEVICE] Async fail: ${cmd}`, err.message);
  });
}

function runSync(cmd: string, timeout = 3000): string {
  const { execSync } = require('child_process');
  try {
    return execSync(cmd, { timeout }).toString().trim();
  } catch (e) {
    console.error(`[DEVICE] Failed: ${cmd}`);
    return '';
  }
}

app.post('/api/device-action', authQuery, (req, res) => {
  const { action } = req.body;
  const results: Record<string, string> = {};

  console.log(`[DEVICE] ${action}`);

  switch (action) {
    // --- WiFi ---
    case 'toggle_wifi': {
      // Respond immediately, toggle in background
      const raw = runSync('termux-wifi-connectioninfo', 4000);
      let wifiOn = false;
      try {
        const info = JSON.parse(raw);
        wifiOn = info.supplicant_state === 'COMPLETED';
      } catch {}
      runAsync(`termux-wifi-enable ${wifiOn ? 'false' : 'true'}`);
      results.message = wifiOn ? 'WiFi כבוי' : 'WiFi דולק';
      break;
    }

    // --- Bluetooth ---
    case 'toggle_bluetooth':
      runAsync('am start -a android.settings.BLUETOOTH_SETTINGS');
      results.message = 'הגדרות בלוטות\'';
      break;

    // --- Flashlight ---
    case 'toggle_flashlight':
      flashlightOn = !flashlightOn;
      runAsync(`termux-torch ${flashlightOn ? 'on' : 'off'}`);
      results.message = flashlightOn ? 'פנס דלוק 🔦' : 'פנס כבוי';
      break;

    // --- Silent/Vibrate mode toggle ---
    case 'vibrate':
      silentMode = !silentMode;
      if (silentMode) {
        runAsync('termux-volume ring 0');
        runAsync('termux-volume notification 0');
        runAsync('termux-vibrate -d 200');
      } else {
        runAsync('termux-volume ring 7');
        runAsync('termux-volume notification 7');
      }
      results.message = silentMode ? 'מצב שקט 🔇' : 'מצב רגיל 🔔';
      break;

    // --- Volume ---
    case 'volume_up':
      cachedVolume = Math.min(cachedVolume + 1, 15);
      runAsync(`termux-volume music ${cachedVolume}`);
      results.message = `ווליום: ${cachedVolume}/15`;
      break;
    case 'volume_down':
      cachedVolume = Math.max(cachedVolume - 1, 0);
      runAsync(`termux-volume music ${cachedVolume}`);
      results.message = `ווליום: ${cachedVolume}/15`;
      break;

    // --- Brightness ---
    case 'brightness_up':
      cachedBrightness = Math.min(cachedBrightness + 30, 255);
      runAsync(`termux-brightness ${cachedBrightness}`);
      results.message = `בהירות: ${Math.round(cachedBrightness / 255 * 100)}%`;
      break;
    case 'brightness_down':
      cachedBrightness = Math.max(cachedBrightness - 30, 5);
      runAsync(`termux-brightness ${cachedBrightness}`);
      results.message = `בהירות: ${Math.round(cachedBrightness / 255 * 100)}%`;
      break;

    // --- Media ---
    case 'media_play_pause':
      runAsync('am broadcast --user 0 -a com.android.music.musicservicecommand --es command togglepause');
      results.message = 'Play/Pause ▶️';
      break;
    case 'media_next':
      runAsync('am broadcast --user 0 -a com.android.music.musicservicecommand --es command next');
      results.message = 'שיר הבא ⏭️';
      break;
    case 'media_previous':
      runAsync('am broadcast --user 0 -a com.android.music.musicservicecommand --es command previous');
      results.message = 'שיר קודם ⏮️';
      break;

    // --- Quick actions ---
    case 'open_dialer':
      runAsync('am start -a android.intent.action.DIAL');
      results.message = 'חייגן נפתח';
      break;
    case 'screenshot':
      runAsync('screencap -p /storage/emulated/0/Screenshots/ai-screenshot.png');
      results.message = 'צילום מסך';
      break;
    case 'screenrecord':
      results.message = 'דורש root';
      break;

    default:
      results.message = `פעולה לא מוכרת: ${action}`;
  }

  res.json(results);
});

// ===== SMART BRIEFING API =====

app.get('/api/smart-briefing', authQuery, async (_req, res) => {
  const { execSync } = require('child_process');
  const briefing: Record<string, unknown> = {};

  // Battery
  try {
    const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
    const b = JSON.parse(raw);
    briefing.battery = `${b.percentage}%${b.status === 'CHARGING' ? ' (טוען)' : ''}`;
  } catch { briefing.battery = 'לא זמין'; }

  // Calendar
  try {
    const { calendarList } = require('./tools/termux-api');
    briefing.calendar = await calendarList(1);
  } catch { briefing.calendar = 'לא זמין'; }

  // WhatsApp
  try {
    const { whatsappMessages } = require('./tools/termux-api');
    briefing.whatsapp = await whatsappMessages();
  } catch { briefing.whatsapp = 'לא זמין'; }

  // Storage
  try {
    const os = require('os');
    const homeDir = process.env.HOME || os.homedir();
    const stat = fs.statfsSync ? fs.statfsSync(homeDir) : null;
    if (stat) {
      const freeMb = Math.round((stat.bsize * stat.bfree) / (1024 * 1024));
      briefing.storage = `${(freeMb / 1024).toFixed(1)}GB פנוי`;
    }
  } catch { briefing.storage = 'לא זמין'; }

  // Reminders
  try {
    const upcoming = reminderService.list(false);
    briefing.reminders = upcoming.length > 0
      ? upcoming.map(r => `• ${r.text}`).join('\n')
      : 'אין תזכורות פתוחות';
  } catch { briefing.reminders = 'לא זמין'; }

  // Time & greeting
  const hour = new Date().getHours();
  briefing.greeting = hour < 12 ? 'בוקר טוב! ☀️' : hour < 17 ? 'צהריים טובים! 🌤️' : hour < 21 ? 'ערב טוב! 🌆' : 'לילה טוב! 🌙';
  briefing.time = new Date().toLocaleString('he-IL');

  res.json(briefing);
});

// ===== DASHBOARD API =====

app.get('/api/dashboard', authMiddleware, async (_req, res) => {
  const { execSync } = require('child_process');
  const os = require('os');

  const data: Record<string, unknown> = {
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    cpus: os.cpus().length,
  };

  // Battery (Termux)
  try {
    const battery = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
    data.battery = JSON.parse(battery);
  } catch {
    data.battery = null;
  }

  // Storage
  try {
    const homeDir = process.env.HOME || os.homedir();
    const stat = fs.statfsSync ? fs.statfsSync(homeDir) : null;
    if (stat) {
      data.storage = {
        total: stat.bsize * stat.blocks,
        free: stat.bsize * stat.bfree,
        used: stat.bsize * (stat.blocks - stat.bfree),
      };
    }
  } catch {
    data.storage = null;
  }

  // Location (Termux)
  try {
    const loc = execSync('termux-location -p network 2>/dev/null', { timeout: 10000 }).toString();
    data.location = JSON.parse(loc);
  } catch {
    data.location = null;
  }

  res.json(data);
});

// ===== FILE EXPLORER API =====

app.get('/api/files', authMiddleware, async (req, res) => {
  try {
    const dirPath = (req.query.path as string) || '/storage/emulated/0';
    const check = isPathAllowed(dirPath);
    if (!check.ok) { res.status(403).json({ error: check.reason }); return; }
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((e) => !e.name.startsWith('.'))
        .map(async (e) => {
          const fullPath = path.join(dirPath, e.name);
          try {
            const stat = await fs.promises.stat(fullPath);
            return {
              name: e.name,
              path: fullPath,
              isDirectory: e.isDirectory(),
              size: stat.size,
              modified: stat.mtime.toISOString(),
            };
          } catch {
            return {
              name: e.name,
              path: fullPath,
              isDirectory: e.isDirectory(),
              size: 0,
              modified: '',
            };
          }
        })
    );
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ path: dirPath, parent: path.dirname(dirPath), items });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/files/read', authMiddleware, async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const check = isPathAllowed(filePath);
    if (!check.ok) { res.status(403).json({ error: check.reason }); return; }
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large (>10MB)' });
      return;
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    res.json({ path: filePath, content, size: stat.size });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/files/write', writeLimit, authMiddleware, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const check = isPathAllowed(filePath);
    if (!check.ok) { res.status(403).json({ error: check.reason }); return; }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/files', writeLimit, authMiddleware, async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const check = isPathAllowed(filePath);
    if (!check.ok) { res.status(403).json({ error: check.reason }); return; }
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      await fs.promises.rm(filePath, { recursive: true });
    } else {
      await fs.promises.unlink(filePath);
    }
    res.json({ success: true, deleted: filePath });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ===== GALLERY API =====

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif']);

app.get('/api/gallery', authMiddleware, async (req, res) => {
  try {
    const customPath = req.query.path as string;
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const images: { name: string; path: string; size: number; modified: string }[] = [];

    async function scanDir(dir: string, depth: number) {
      if (depth > 3 || images.length >= limit) return;
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (images.length >= limit) break;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await scanDir(full, depth + 1);
          } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            try {
              const stat = await fs.promises.stat(full);
              images.push({
                name: entry.name,
                path: full,
                size: stat.size,
                modified: stat.mtime.toISOString(),
              });
            } catch { /* skip unreadable */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    if (customPath) {
      await scanDir(customPath, 0);
    } else {
      // Scan all common image folders
      const baseDirs = [
        '/storage/emulated/0/DCIM',
        '/storage/emulated/0/Pictures',
        '/storage/emulated/0/Screenshots',
        '/storage/emulated/0/Download',
      ];
      for (const dir of baseDirs) {
        if (images.length >= limit) break;
        await scanDir(dir, 0);
      }
    }

    images.sort((a, b) => b.modified.localeCompare(a.modified));
    const galleryPath = customPath || '/storage/emulated/0';
    res.json({ path: galleryPath, count: images.length, images });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/gallery/image', (req, res, next) => {
  // Allow auth via query param for img tags
  const token = req.query.token as string;
  if (token === AUTH_TOKEN) return next();
  return authMiddleware(req, res, next);
}, async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const check = isPathAllowed(filePath);
    if (!check.ok) { res.status(403).json({ error: check.reason }); return; }

    // Check file exists and get size
    const stat = await fs.promises.stat(filePath);

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
      '.heic': 'image/heic', '.heif': 'image/heif',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', stat.size);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ===== HTTP SERVER + WEBSOCKET =====
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Active agents per connection
const agents = new Map<string, ClaudeAgent>();

// Proactive agent broadcasts to all connected clients
proactiveAgent.setNotifyHandler((action) => {
  const msg = JSON.stringify({ type: 'proactive_action', payload: action });
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    } catch {}
  });
});

// ===== WEBSOCKET KEEPALIVE =====
// Ping every 25s to detect dead connections before they cause errors
const WS_PING_INTERVAL = setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    if ((ws as any).__isAlive === false) {
      console.log('[WS] Terminating dead connection');
      return ws.terminate();
    }
    (ws as any).__isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 25000);

wss.on('close', () => clearInterval(WS_PING_INTERVAL));

// Safe send: never crash on dead socket
function safeSend(ws: WebSocket, data: string): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  } catch (err) {
    console.error('[WS] safeSend failed:', (err as Error).message);
  }
}

wss.on('connection', (ws: WebSocket, req) => {
  // Keepalive tracking
  (ws as any).__isAlive = true;
  ws.on('pong', () => { (ws as any).__isAlive = true; });
  // Auth check
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');
  if (token !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const connectionId = uuidv4();
  console.log(`[WS] Client connected: ${connectionId}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'ANTHROPIC_API_KEY not set in .env' },
    }));
    ws.close();
    return;
  }

  // Read model from query params
  const selectedModel = url.searchParams.get('model') || 'claude-sonnet-4-6';
  console.log(`[WS] Model: ${selectedModel}`);

  // Create agent for this connection — use safeSend to prevent crashes
  const agent = new ClaudeAgent(apiKey, (event: WSResponse) => {
    safeSend(ws, JSON.stringify(event));
  }, selectedModel);

  agents.set(connectionId, agent);

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'chat') {
        const userMessage = msg.payload.message as string;
        const images = msg.payload.images as { base64: string; mediaType: string }[] | undefined;
        console.log(`[${connectionId}] User: ${userMessage.substring(0, 100)}${images ? ` [+${images.length} images]` : ''}`);

        // Personality Engine: record message + time
        personalityEngine.recordUserMessage(userMessage);
        personalityEngine.recordActivity();

        // Try offline command first (no AI needed)
        if (!images) {
          const offlineResult = tryOfflineCommand(userMessage);
          if (offlineResult) {
            try {
              const result = await offlineResult;
              if (result.handled) {
                safeSend(ws, JSON.stringify({ type: 'text_delta', payload: { text: result.response } }));
                safeSend(ws, JSON.stringify({ type: 'message_done', payload: { text: result.response } }));
                console.log(`[${connectionId}] Offline command handled`);
                return;
              }
            } catch {}
          }
        }

        try {
          await agent.processMessage(userMessage, images);
          // Auto-save conversation after each exchange
          try {
            const snap = agent.getConversationSnapshot();
            if (snap.messages.length >= 2) {
              conversationHistory.save({
                id: snap.id,
                title: '',
                messages: snap.messages.map((m, i) => ({
                  id: `${snap.id}-${i}`,
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                  timestamp: Date.now(),
                })),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              // Personality Engine: deep analysis (non-blocking, uses Haiku)
              personalityEngine.analyzeConversation(snap.messages).catch(() => {});
            }
          } catch (saveErr) {
            console.error(`[${connectionId}] Save error (non-fatal):`, (saveErr as Error).message);
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          console.error(`[${connectionId}] Agent error:`, errorMsg);

          // Fallback to local LLM if available
          if (!images && localLLM.isAvailable()) {
            try {
              console.log(`[${connectionId}] Falling back to local LLM...`);
              safeSend(ws, JSON.stringify({ type: 'text_delta', payload: { text: '🔄 Claude לא זמין. משתמש במודל מקומי...\n\n' } }));
              const localResponse = localLLM.generate(userMessage);
              safeSend(ws, JSON.stringify({ type: 'text_delta', payload: { text: localResponse } }));
              safeSend(ws, JSON.stringify({ type: 'message_done', payload: { text: localResponse } }));
              return;
            } catch (llmErr) {
              console.error(`[${connectionId}] Local LLM also failed:`, (llmErr as Error).message);
            }
          }

          safeSend(ws, JSON.stringify({
            type: 'error',
            payload: { message: '❌ ' + errorMsg + (localLLM.isAvailable() ? '' : '\n\nטיפ: התקן llama.cpp למצב offline') },
          }));
        }
      } else if (msg.type === 'approval_response') {
        const { id, approved } = msg.payload;
        agent.resolveApproval(id as string, approved as boolean);
      } else if (msg.type === 'ping') {
        // Client keepalive — respond with pong and mark alive
        (ws as any).__isAlive = true;
        safeSend(ws, JSON.stringify({ type: 'pong', payload: {} }));
      } else if (msg.type === 'abort') {
        // For future: abort running operation
        console.log(`[${connectionId}] Abort requested`);
      } else if (msg.type === 'set_live_mode') {
        const live = msg.payload.enabled === true;
        agent.setLiveMode(live);
        console.log(`[${connectionId}] Live mode: ${live}`);
      } else if (msg.type === 'clear_history') {
        agent.clearHistory();
        safeSend(ws, JSON.stringify({
          type: 'message_done',
          payload: { text: 'Conversation history cleared.' },
        }));
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
      safeSend(ws, JSON.stringify({
        type: 'error',
        payload: { message: 'Invalid message format' },
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${connectionId}`);
    const agentToCleanup = agents.get(connectionId);
    if (agentToCleanup) {
      try { agentToCleanup.cleanup(); } catch {}
    }
    agents.delete(connectionId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${connectionId}:`, err.message);
  });
});

// ===== SERVE FRONTEND =====
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (_req, res) => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend not built. Run: cd web && npm run build');
    }
  });
} else {
  app.get('/', (_req, res) => {
    res.send(`
      <html><body style="background:#0a0a0a;color:#e5e5e5;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column">
        <h1>🤖 AI Agent Server</h1>
        <p>Backend is running. Build the frontend:</p>
        <code style="background:#1a1a2e;padding:12px;border-radius:8px;margin-top:8px">cd web && npm run build</code>
      </body></html>
    `);
  });
}

// ===== VOICE DAEMON WIRING =====

// Broadcast daemon events to all connected WS clients
voiceDaemon.setEventHandler((data) => {
  const msg = JSON.stringify({ type: 'voice_daemon', payload: data });
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    } catch {}
  });
  // Only log important events, skip repetitive 'listening' ticks
  if (data.event !== 'listening') {
    console.log(`[VoiceDaemon] ${data.event}${data.text ? ': ' + data.text.substring(0, 60) : ''}`);
  }
});

// Create a dedicated agent for the daemon (lazy, on first start)
let daemonAgent: ClaudeAgent | null = null;
function getDaemonAgent(): ClaudeAgent | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!daemonAgent) {
    daemonAgent = new ClaudeAgent(apiKey, (event: WSResponse) => {
      // Forward agent events as daemon WS events
      const msg = JSON.stringify({ type: 'voice_daemon_agent', payload: event });
      wss.clients.forEach((client) => {
        try {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        } catch {}
      });
    }, 'claude-sonnet-4-6');
  }
  return daemonAgent;
}

voiceDaemon.setMessageProcessor(async (message: string) => {
  const agent = getDaemonAgent();
  if (!agent) throw new Error('No API key configured');
  return agent.processMessage(message);
});

// Auto-start daemon if configured
if (process.env.AUTO_VOICE_DAEMON === 'true') {
  setTimeout(() => {
    voiceDaemon.start('wake_word').then(msg => console.log('[VoiceDaemon]', msg));
  }, 5000);
}

// ===== PID FILE + PORT MANAGEMENT =====
const PID_FILE = path.join(process.env.HOME || '.', '.ai-agent', 'merlin.pid');

function killPortHolder(port: number): void {
  const methods = [
    // Method 1: PID file from previous run
    () => {
      if (fs.existsSync(PID_FILE)) {
        const oldPid = fs.readFileSync(PID_FILE, 'utf-8').trim();
        if (oldPid) execSync(`kill -9 ${oldPid} 2>/dev/null || true`, { timeout: 2000 });
      }
    },
    // Method 2: kill other node server processes (exclude ourselves)
    () => {
      const myPid = process.pid;
      const pids = execSync(`pgrep -f "node.*server" 2>/dev/null || true`, { timeout: 2000 }).toString().trim().split('\n').filter(p => p && p.trim() !== String(myPid));
      for (const pid of pids) {
        try { execSync(`kill -9 ${pid.trim()} 2>/dev/null || true`, { timeout: 1000 }); } catch {}
      }
    },
    // Method 3: fuser
    () => execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { timeout: 3000 }),
    // Method 4: lsof
    () => execSync(`kill -9 $(lsof -t -i:${port}) 2>/dev/null || true`, { timeout: 3000 }),
  ];
  for (const method of methods) {
    try { method(); } catch {}
  }
}

function writePidFile(): void {
  try {
    const dir = path.dirname(PID_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {}
}

process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch {} });

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function startWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const free = await isPortFree(PORT);
    if (free) {
      server.listen(PORT, '0.0.0.0', () => {
        writePidFile();
        console.log('');
        console.log('╔════════════════════════════════════════╗');
        console.log('║       🤖 AI Agent Server Running       ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║  HTTP: http://localhost:${PORT}           ║`);
        console.log(`║  WS:   ws://localhost:${PORT}/ws          ║`);
        console.log('║                                        ║');
        console.log('║  Open Chrome on your phone:            ║');
        console.log(`║  http://localhost:${PORT}                  ║`);
        console.log('╚════════════════════════════════════════╝');
        console.log('');
      });
      return;
    }
    console.log(`[Server] Port ${PORT} busy — killing old process (attempt ${attempt}/5)...`);
    killPortHolder(PORT);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error(`[Server] Could not free port ${PORT} after 5 attempts. Exiting.`);
  process.exit(1);
}

// ===== START =====
startWithRetry();
