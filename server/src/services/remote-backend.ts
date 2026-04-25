/**
 * Remote Backend Connector
 * Allows the phone agent to offload heavy tasks to a PC/cloud backend.
 * 
 * Architecture:
 * - Phone runs its own server (current setup)
 * - PC runs the same server (or a lighter version)
 * - Phone connects to PC via WebSocket for heavy tasks
 * - Fallback: if PC is unavailable, use phone's own API
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const CONFIG_FILE = path.join(DATA_DIR, 'remote-backend.json');

export interface RemoteBackendConfig {
  enabled: boolean;
  url: string;           // ws://192.168.1.X:3002/ws or wss://xxx.ngrok.io/ws
  authToken: string;
  autoConnect: boolean;
  offloadPatterns: string[]; // which tasks to send to PC
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

const DEFAULT_CONFIG: RemoteBackendConfig = {
  enabled: false,
  url: '',
  authToken: 'dev-token',
  autoConnect: true,
  offloadPatterns: ['תתקן', 'fix', 'debug', 'תבנה', 'build', 'refactor', 'analyze'],
};

export class RemoteBackend {
  private config: RemoteBackendConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.config = this.loadConfig();
    if (this.config.enabled && this.config.autoConnect && this.config.url) {
      setTimeout(() => this.connect(), 3000);
    }
  }

  private loadConfig(): RemoteBackendConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
      }
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(partial: Partial<RemoteBackendConfig>): void {
    this.config = { ...this.config, ...partial };
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch {}
  }

  getConfig(): RemoteBackendConfig {
    return this.config;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Should this message be offloaded to the remote backend?
  shouldOffload(message: string): boolean {
    if (!this.isConnected()) return false;
    return this.config.offloadPatterns.some(p =>
      message.toLowerCase().includes(p.toLowerCase())
    );
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.config.url) {
        console.log('[RemoteBackend] No URL configured');
        resolve(false);
        return;
      }

      try {
        console.log(`[RemoteBackend] Connecting to ${this.config.url}...`);
        this.ws = new WebSocket(this.config.url, {
          headers: { Authorization: `Bearer ${this.config.authToken}` },
          handshakeTimeout: 5000,
        });

        this.ws.on('open', () => {
          console.log('[RemoteBackend] Connected to PC backend');
          this.connected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve(true);
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          console.log('[RemoteBackend] Disconnected from PC');
          this.connected = false;
          this.stopHeartbeat();
          this.rejectAllPending('Backend disconnected');
          this.maybeReconnect();
        });

        this.ws.on('error', (err) => {
          console.log(`[RemoteBackend] Connection error: ${err.message}`);
          this.connected = false;
          resolve(false);
        });

        // Timeout
        setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            resolve(false);
          }
        }, 6000);
      } catch {
        resolve(false);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.connected = false;
    this.ws?.close();
    this.ws = null;
    this.rejectAllPending('Disconnected');
  }

  // Send a message to the remote backend and wait for response
  async sendMessage(message: string, requestId?: string): Promise<string> {
    if (!this.isConnected()) throw new Error('Remote backend not connected');

    const id = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Remote backend timeout (60s)'));
      }, 60000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.ws!.send(JSON.stringify({
        type: 'chat',
        payload: { message, requestId: id },
      }));
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Route response to pending request
      if (msg.type === 'message_done' && msg.payload?.requestId) {
        const pending = this.pendingRequests.get(msg.payload.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.payload.requestId);
          pending.resolve(msg.payload.text || '');
        }
      }

      // Heartbeat pong
      if (msg.type === 'pong') {
        // PC is alive
      }
    } catch {}
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        try {
          this.ws!.send(JSON.stringify({ type: 'ping' }));
        } catch {
          this.connected = false;
        }
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private maybeReconnect(): void {
    if (!this.config.autoConnect || !this.config.url) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[RemoteBackend] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    console.log(`[RemoteBackend] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => this.connect(), delay);
  }

  getStatus(): { connected: boolean; url: string; enabled: boolean } {
    return {
      connected: this.isConnected(),
      url: this.config.url,
      enabled: this.config.enabled,
    };
  }
}
