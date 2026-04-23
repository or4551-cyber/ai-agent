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

dotenv.config();

// Start background services
let observer: ObserverService | null = null;
const reminderService = new ReminderService();
reminderService.start();

const routineService = new RoutineService();
routineService.start();

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
    const dirPath = (req.query.path as string) || process.env.HOME || '.';
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
    if (stat.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large (>2MB)' });
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
    const galleryPath = (req.query.path as string) || '/storage/emulated/0/DCIM';
    const limit = Math.min(Number(req.query.limit) || 100, 500);

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

    await scanDir(galleryPath, 0);
    images.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ path: galleryPath, count: images.length, images });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/gallery/image', authMiddleware, async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
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
