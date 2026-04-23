import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { ClaudeAgent } from './agent/claude-agent';
import { WSResponse } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ObserverService } from './observer/service';
import { ReminderService } from './services/reminders';
import { RoutineService } from './services/routines';
import { generateBriefing } from './services/briefing';
import { UserProfileService } from './services/user-profile';
import { StorageScanner } from './services/storage-scanner';
import { SmartAlertsService } from './services/smart-alerts';
import { ConversationHistoryService } from './services/conversation-history';

dotenv.config();

// Start background services
let observer: ObserverService | null = null;
const reminderService = new ReminderService();
reminderService.start();

const routineService = new RoutineService();
routineService.start();

const userProfileService = new UserProfileService();
const storageScanner = new StorageScanner();
const smartAlerts = new SmartAlertsService();
smartAlerts.start();
const conversationHistory = new ConversationHistoryService();

if (process.env.ANTHROPIC_API_KEY) {
  observer = new ObserverService(process.env.ANTHROPIC_API_KEY);
  observer.start();
}

const app = express();
const PORT = Number(process.env.PORT) || 3002;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token';
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'web', 'out');

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

// ===== REST ENDPOINTS =====

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/api/tools', authMiddleware, (_req, res) => {
  const { getToolDefinitions } = require('./tools/definitions');
  res.json({ tools: getToolDefinitions() });
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
    res.status(400).json({ error: 'Observer not running' });
    return;
  }
  const suggestions = await observer.runDigest();
  res.json({ suggestions });
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

// ===== DEVICE CONTROL PANEL API =====

function authQuery(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.get('/api/device-stats', authQuery, async (_req, res) => {
  const { execSync } = require('child_process');
  const os = require('os');
  const stats: Record<string, unknown> = {};

  // Battery
  try {
    const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
    const b = JSON.parse(raw);
    stats.battery = { level: b.percentage ?? -1, charging: b.status === 'CHARGING', temperature: b.temperature };
  } catch {
    stats.battery = { level: -1, charging: false };
  }

  // Storage
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
    const raw = execSync('termux-volume 2>/dev/null', { timeout: 3000 }).toString();
    const volumes = JSON.parse(raw);
    const music = volumes.find((v: any) => v.stream === 'music');
    stats.volume = music?.volume ?? 7;
  } catch {
    stats.volume = 7;
  }

  // Brightness (read from Android settings)
  try {
    const raw = execSync('settings get system screen_brightness 2>/dev/null', { timeout: 2000 }).toString();
    const val = parseInt(raw.trim());
    stats.brightness = isNaN(val) ? 50 : Math.round(val / 255 * 100);
  } catch {
    stats.brightness = 50;
  }

  // WiFi
  try {
    const raw = execSync('termux-wifi-connectioninfo 2>/dev/null', { timeout: 3000 }).toString();
    const wifi = JSON.parse(raw);
    stats.wifi = wifi.supplicant_state === 'COMPLETED' || (wifi.ip && wifi.ip !== '' && wifi.ip !== '<unknown ssid>');
  } catch {
    stats.wifi = false;
  }

  // Bluetooth (check via settings)
  try {
    const raw = execSync('settings get global bluetooth_on 2>/dev/null', { timeout: 2000 }).toString();
    stats.bluetooth = raw.trim() === '1';
  } catch {
    stats.bluetooth = false;
  }

  stats.flashlight = flashlightOn ?? false;

  res.json(stats);
});

// Track flashlight state (Termux:API has no query command)
let flashlightOn = false;

app.post('/api/device-action', authQuery, async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body;
  const results: Record<string, string> = {};

  const run = (cmd: string, timeout = 5000): string => {
    try {
      console.log(`[DEVICE] Running: ${cmd}`);
      const out = execSync(cmd, { timeout }).toString().trim();
      console.log(`[DEVICE] Output: ${out.substring(0, 200)}`);
      return out;
    } catch (e) {
      console.error(`[DEVICE] Failed: ${cmd}`, (e as Error).message);
      return '';
    }
  };

  const toast = (msg: string) => run(`termux-toast "${msg}"`, 3000);

  console.log(`[DEVICE] Action requested: ${action}`);

  try {
    switch (action) {
      // --- WiFi: detect state, then flip ---
      case 'toggle_wifi': {
        toast('WiFi...');
        let wifiOn = false;
        try {
          const raw = run('termux-wifi-connectioninfo', 5000);
          const info = JSON.parse(raw);
          wifiOn = info.supplicant_state === 'COMPLETED' || (info.ip && info.ip !== '' && info.ip !== '<unknown ssid>');
        } catch {}
        run(`termux-wifi-enable ${wifiOn ? 'false' : 'true'}`);
        results.message = wifiOn ? 'WiFi כבוי' : 'WiFi דולק';
        toast(results.message);
        break;
      }

      // --- Bluetooth: open system dialog ---
      case 'toggle_bluetooth':
        run('am start -a android.settings.BLUETOOTH_SETTINGS');
        results.message = 'הגדרות בלוטות\' נפתחו';
        break;

      // --- Flashlight: on/off toggle ---
      case 'toggle_flashlight':
        flashlightOn = !flashlightOn;
        run(`termux-torch ${flashlightOn ? 'on' : 'off'}`);
        results.message = flashlightOn ? 'פנס דלוק' : 'פנס כבוי';
        toast(results.message);
        break;

      // --- Vibrate ---
      case 'vibrate':
        run('termux-vibrate -d 300');
        results.message = 'רטט';
        break;

      // --- Volume: read current, adjust, set ---
      case 'volume_up': {
        let vol = 7;
        try {
          const raw = run('termux-volume', 3000);
          const volumes = JSON.parse(raw);
          const music = volumes.find((v: any) => v.stream === 'music');
          vol = music?.volume ?? 7;
        } catch {}
        const newVol = Math.min(vol + 1, 15);
        run(`termux-volume music ${newVol}`);
        results.message = `ווליום: ${newVol}/15`;
        toast(results.message);
        break;
      }
      case 'volume_down': {
        let vol = 7;
        try {
          const raw = run('termux-volume', 3000);
          const volumes = JSON.parse(raw);
          const music = volumes.find((v: any) => v.stream === 'music');
          vol = music?.volume ?? 7;
        } catch {}
        const newVol = Math.max(vol - 1, 0);
        run(`termux-volume music ${newVol}`);
        results.message = `ווליום: ${newVol}/15`;
        toast(results.message);
        break;
      }

      // --- Brightness: adjust by 30 (range 0-255) ---
      case 'brightness_up': {
        let cur = 128;
        try {
          const raw = run('settings get system screen_brightness', 2000);
          cur = parseInt(raw) || 128;
        } catch {}
        const newBr = Math.min(cur + 30, 255);
        run(`termux-brightness ${newBr}`);
        results.message = `בהירות: ${Math.round(newBr / 255 * 100)}%`;
        toast(results.message);
        break;
      }
      case 'brightness_down': {
        let cur = 128;
        try {
          const raw = run('settings get system screen_brightness', 2000);
          cur = parseInt(raw) || 128;
        } catch {}
        const newBr = Math.max(cur - 30, 5);
        run(`termux-brightness ${newBr}`);
        results.message = `בהירות: ${Math.round(newBr / 255 * 100)}%`;
        toast(results.message);
        break;
      }

      // --- Media: use am broadcast for widest player support ---
      case 'media_play_pause':
        run('am broadcast --user 0 -a com.android.music.musicservicecommand --es command togglepause');
        results.message = 'Play/Pause';
        break;
      case 'media_next':
        run('am broadcast --user 0 -a com.android.music.musicservicecommand --es command next');
        results.message = 'שיר הבא';
        break;
      case 'media_previous':
        run('am broadcast --user 0 -a com.android.music.musicservicecommand --es command previous');
        results.message = 'שיר קודם';
        break;

      // --- Quick actions ---
      case 'open_dialer':
        run('am start -a android.intent.action.DIAL');
        results.message = 'חייגן נפתח';
        break;
      case 'screenshot':
        run('termux-toast "מצלם מסך..."');
        run('su -c "screencap -p /storage/emulated/0/Screenshots/ai-screenshot-$(date +%s).png" 2>/dev/null || termux-toast "צילום מסך דורש הרשאות root"');
        results.message = 'צילום מסך';
        break;
      case 'screenrecord':
        run('termux-toast "הקלטה לא זמינה ללא root"');
        results.message = 'דורש root';
        break;

      default:
        results.message = `פעולה לא מוכרת: ${action}`;
    }
  } catch (err) {
    results.message = `שגיאה: ${(err as Error).message}`;
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

app.post('/api/files/write', authMiddleware, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/files', authMiddleware, async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
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

wss.on('connection', (ws: WebSocket, req) => {
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
  const selectedModel = url.searchParams.get('model') || 'claude-sonnet-4-20250514';
  console.log(`[WS] Model: ${selectedModel}`);

  // Create agent for this connection
  const agent = new ClaudeAgent(apiKey, (event: WSResponse) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }, selectedModel);

  agents.set(connectionId, agent);

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'chat') {
        const userMessage = msg.payload.message as string;
        const images = msg.payload.images as { base64: string; mediaType: string }[] | undefined;
        console.log(`[${connectionId}] User: ${userMessage.substring(0, 100)}${images ? ` [+${images.length} images]` : ''}`);

        try {
          await agent.processMessage(userMessage, images);
        } catch (err) {
          const errorMsg = (err as Error).message;
          console.error(`[${connectionId}] Agent error:`, errorMsg);
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: errorMsg },
          }));
        }
      } else if (msg.type === 'approval_response') {
        const { id, approved } = msg.payload;
        agent.resolveApproval(id as string, approved as boolean);
      } else if (msg.type === 'abort') {
        // For future: abort running operation
        console.log(`[${connectionId}] Abort requested`);
      } else if (msg.type === 'clear_history') {
        agent.clearHistory();
        ws.send(JSON.stringify({
          type: 'message_done',
          payload: { text: 'Conversation history cleared.' },
        }));
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Invalid message format' },
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${connectionId}`);
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

// ===== START =====
server.listen(PORT, '0.0.0.0', () => {
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
