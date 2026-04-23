import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { ClaudeAgent } from './agent/claude-agent';
import { WSResponse } from './types';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3002;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token';

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

  // Create agent for this connection
  const agent = new ClaudeAgent(apiKey, (event: WSResponse) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  agents.set(connectionId, agent);

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'chat') {
        const userMessage = msg.payload.message as string;
        console.log(`[${connectionId}] User: ${userMessage.substring(0, 100)}`);

        try {
          await agent.processMessage(userMessage);
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
  console.log(`║  http://localhost:3000                  ║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});
