/**
 * DeviceSync — Multi-device synergy for Merlin
 *
 * Enables two (or more) Merlin instances to work together:
 *  - Auto-discover peers on the local network
 *  - Sync shared data: memory, profile, favorites, personality
 *  - Cross-device messaging (e.g. "send summary to tablet")
 *  - Device role awareness (phone=mobile, tablet=home station)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const DEVICE_FILE = path.join(DATA_DIR, 'device-identity.json');
const PEERS_FILE = path.join(DATA_DIR, 'known-peers.json');

// Files that should be synced between devices
const SYNCABLE_FILES = [
  'memory.json',
  'user-profile.json',
  'favorites.json',
  'personality.json',
];

// ===== TYPES =====

export type DeviceType = 'phone' | 'tablet' | 'pc' | 'unknown';

export interface DeviceIdentity {
  id: string;           // unique device ID
  name: string;         // user-friendly name: "הטלפון של אור", "הטאבלט"
  type: DeviceType;
  model: string;        // "Samsung Galaxy S24", "Tab S10 Ultra"
  ip?: string;          // last known local IP
  port: number;         // Merlin server port (default 3002)
  lastSeen: string;
  createdAt: string;
}

export interface PeerDevice extends DeviceIdentity {
  online: boolean;
  latencyMs?: number;
}

export interface SyncManifest {
  deviceId: string;
  files: {
    name: string;
    hash: string;      // MD5 of content for change detection
    updatedAt: number;  // mtime epoch ms
    size: number;
  }[];
  timestamp: number;
}

export interface CrossDeviceMessage {
  from: string;         // device ID
  to: string;           // device ID or '*' for broadcast
  type: 'notification' | 'command' | 'sync_request' | 'sync_data' | 'ping' | 'pong';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ===== SERVICE =====

export class DeviceSyncService {
  private identity: DeviceIdentity;
  private peers: Map<string, PeerDevice> = new Map();
  private discoveryTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private serverPort: number;
  private messageHandlers: ((msg: CrossDeviceMessage) => void)[] = [];

  constructor(serverPort = 3002) {
    this.serverPort = serverPort;
    this.ensureDir();
    this.identity = this.loadOrCreateIdentity();
    this.loadPeers();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // ===== IDENTITY =====

  private loadOrCreateIdentity(): DeviceIdentity {
    try {
      if (fs.existsSync(DEVICE_FILE)) {
        const data = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf-8'));
        // Update port in case it changed
        data.port = this.serverPort;
        return data;
      }
    } catch {}

    // Auto-detect device type from environment
    const deviceType = this.detectDeviceType();
    const model = this.detectModel();
    const now = new Date().toISOString();

    const identity: DeviceIdentity = {
      id: `merlin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: deviceType === 'tablet' ? 'הטאבלט' : deviceType === 'phone' ? 'הטלפון' : 'מכשיר',
      type: deviceType,
      model,
      port: this.serverPort,
      lastSeen: now,
      createdAt: now,
    };

    this.saveIdentity(identity);
    return identity;
  }

  private saveIdentity(identity: DeviceIdentity): void {
    try {
      identity.lastSeen = new Date().toISOString();
      fs.writeFileSync(DEVICE_FILE, JSON.stringify(identity, null, 2), 'utf-8');
    } catch {}
  }

  private detectDeviceType(): DeviceType {
    try {
      // On Termux, check screen size or device model
      const { execSync } = require('child_process');
      const model = execSync('getprop ro.product.model 2>/dev/null', { timeout: 3000 }).toString().trim();
      if (/tab|pad|sm-x/i.test(model)) return 'tablet';
      if (/sm-|pixel|galaxy|oneplus|xiaomi|huawei/i.test(model)) return 'phone';
      return 'unknown';
    } catch {
      return process.platform === 'win32' || process.platform === 'darwin' ? 'pc' : 'unknown';
    }
  }

  private detectModel(): string {
    try {
      const { execSync } = require('child_process');
      return execSync('getprop ro.product.model 2>/dev/null', { timeout: 3000 }).toString().trim() || 'Unknown';
    } catch {
      return process.platform === 'win32' ? 'Windows PC' : 'Unknown';
    }
  }

  // ===== PEER MANAGEMENT =====

  private loadPeers(): void {
    try {
      if (fs.existsSync(PEERS_FILE)) {
        const arr: PeerDevice[] = JSON.parse(fs.readFileSync(PEERS_FILE, 'utf-8'));
        for (const p of arr) {
          this.peers.set(p.id, { ...p, online: false });
        }
      }
    } catch {}
  }

  private savePeers(): void {
    try {
      const arr = Array.from(this.peers.values());
      fs.writeFileSync(PEERS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
    } catch {}
  }

  addPeer(ip: string, port = 3002): Promise<PeerDevice | null> {
    return this.pingPeer(ip, port);
  }

  removePeer(id: string): boolean {
    const ok = this.peers.delete(id);
    if (ok) this.savePeers();
    return ok;
  }

  getPeers(): PeerDevice[] {
    return Array.from(this.peers.values());
  }

  getOnlinePeers(): PeerDevice[] {
    return this.getPeers().filter(p => p.online);
  }

  // ===== DISCOVERY =====

  start(): void {
    console.log(`[DeviceSync] Started as "${this.identity.name}" (${this.identity.type}, ${this.identity.id.slice(0, 12)}...)`);

    // Ping known peers immediately
    this.pingAllPeers();

    // Re-ping every 60 seconds
    this.discoveryTimer = setInterval(() => this.pingAllPeers(), 60000);

    // Auto-sync every 5 minutes
    this.syncTimer = setInterval(() => this.syncWithPeers(), 5 * 60000);
  }

  stop(): void {
    if (this.discoveryTimer) { clearInterval(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
  }

  private async pingAllPeers(): Promise<void> {
    for (const peer of this.peers.values()) {
      if (peer.ip) {
        await this.pingPeer(peer.ip, peer.port);
      }
    }
  }

  private pingPeer(ip: string, port: number): Promise<PeerDevice | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const req = http.get(`http://${ip}:${port}/api/device-sync/identity`, {
        timeout: 5000,
        headers: { 'X-Merlin-Device-Id': this.identity.id },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const remote: DeviceIdentity = JSON.parse(body);
            if (remote.id === this.identity.id) {
              resolve(null); // Don't peer with self
              return;
            }
            const peer: PeerDevice = {
              ...remote,
              ip,
              port,
              online: true,
              latencyMs: Date.now() - start,
              lastSeen: new Date().toISOString(),
            };
            this.peers.set(peer.id, peer);
            this.savePeers();
            console.log(`[DeviceSync] Peer online: ${peer.name} (${peer.type}) @ ${ip}:${port} — ${peer.latencyMs}ms`);
            resolve(peer);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        // Mark peer offline
        for (const [id, peer] of this.peers) {
          if (peer.ip === ip && peer.port === port) {
            peer.online = false;
          }
        }
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  // ===== SYNC =====

  getManifest(): SyncManifest {
    const files = SYNCABLE_FILES.map(name => {
      const filePath = path.join(DATA_DIR, name);
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        // Simple hash: length + mtime (fast, good enough for change detection)
        const hash = `${content.length}-${stat.mtimeMs.toFixed(0)}`;
        return { name, hash, updatedAt: Math.round(stat.mtimeMs), size: stat.size };
      } catch {
        return { name, hash: 'missing', updatedAt: 0, size: 0 };
      }
    }).filter(f => f.hash !== 'missing');

    return {
      deviceId: this.identity.id,
      files,
      timestamp: Date.now(),
    };
  }

  getFileContent(fileName: string): string | null {
    if (!SYNCABLE_FILES.includes(fileName)) return null;
    try {
      return fs.readFileSync(path.join(DATA_DIR, fileName), 'utf-8');
    } catch {
      return null;
    }
  }

  applyRemoteFile(fileName: string, content: string): boolean {
    if (!SYNCABLE_FILES.includes(fileName)) return false;
    try {
      // Validate JSON
      JSON.parse(content);
      fs.writeFileSync(path.join(DATA_DIR, fileName), content, 'utf-8');
      console.log(`[DeviceSync] Applied remote ${fileName}`);
      return true;
    } catch {
      return false;
    }
  }

  // Merge strategy: for arrays, combine unique entries; for objects, use newer
  mergeData(fileName: string, remoteContent: string, remoteTimestamp: number): boolean {
    const localPath = path.join(DATA_DIR, fileName);
    try {
      const remote = JSON.parse(remoteContent);

      if (!fs.existsSync(localPath)) {
        // No local file — just accept remote
        fs.writeFileSync(localPath, JSON.stringify(remote, null, 2), 'utf-8');
        return true;
      }

      const local = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      const localStat = fs.statSync(localPath);

      // If remote is newer, use it (but merge arrays)
      if (remoteTimestamp > localStat.mtimeMs) {
        // For memory.json (array of entries), merge by key
        if (fileName === 'memory.json' && Array.isArray(local) && Array.isArray(remote)) {
          const merged = new Map<string, unknown>();
          for (const entry of local) merged.set(entry.key, entry);
          for (const entry of remote) {
            const existing = merged.get(entry.key) as Record<string, string> | undefined;
            if (!existing || entry.updatedAt > existing.updatedAt) {
              merged.set(entry.key, entry);
            }
          }
          fs.writeFileSync(localPath, JSON.stringify(Array.from(merged.values()), null, 2), 'utf-8');
          return true;
        }

        // For other files, remote wins if newer
        fs.writeFileSync(localPath, JSON.stringify(remote, null, 2), 'utf-8');
        return true;
      }

      return false; // Local is newer, no change
    } catch {
      return false;
    }
  }

  private async syncWithPeers(): Promise<void> {
    const online = this.getOnlinePeers();
    if (online.length === 0) return;

    for (const peer of online) {
      try {
        // Get peer's manifest
        const manifest = await this.fetchJson<SyncManifest>(`http://${peer.ip}:${peer.port}/api/device-sync/manifest`);
        if (!manifest) continue;

        const localManifest = this.getManifest();

        // Find files that differ
        for (const remoteFile of manifest.files) {
          const localFile = localManifest.files.find(f => f.name === remoteFile.name);
          if (!localFile || localFile.hash !== remoteFile.hash) {
            // File differs — fetch remote and merge
            if (!localFile || remoteFile.updatedAt > localFile.updatedAt) {
              const content = await this.fetchText(`http://${peer.ip}:${peer.port}/api/device-sync/file/${remoteFile.name}`);
              if (content) {
                this.mergeData(remoteFile.name, content, remoteFile.updatedAt);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[DeviceSync] Sync with ${peer.name} failed:`, (err as Error).message);
      }
    }
  }

  // ===== CROSS-DEVICE MESSAGING =====

  onMessage(handler: (msg: CrossDeviceMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  handleIncomingMessage(msg: CrossDeviceMessage): void {
    for (const handler of this.messageHandlers) {
      try { handler(msg); } catch {}
    }
  }

  async sendToPeer(peerId: string, type: CrossDeviceMessage['type'], payload: Record<string, unknown>): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer?.online || !peer.ip) return false;

    const msg: CrossDeviceMessage = {
      from: this.identity.id,
      to: peerId,
      type,
      payload,
      timestamp: Date.now(),
    };

    try {
      await this.postJson(`http://${peer.ip}:${peer.port}/api/device-sync/message`, msg);
      return true;
    } catch {
      return false;
    }
  }

  async broadcastToPeers(type: CrossDeviceMessage['type'], payload: Record<string, unknown>): Promise<number> {
    let sent = 0;
    for (const peer of this.getOnlinePeers()) {
      if (await this.sendToPeer(peer.id, type, payload)) sent++;
    }
    return sent;
  }

  // ===== HELPERS =====

  private fetchJson<T>(url: string): Promise<T | null> {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private fetchText(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve(body || null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private postJson(url: string, data: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data);
      const parsed = new URL(url);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Merlin-Device-Id': this.identity.id,
        },
        timeout: 5000,
      }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ===== GETTERS =====

  getIdentity(): DeviceIdentity { return this.identity; }

  setDeviceName(name: string): void {
    this.identity.name = name;
    this.saveIdentity(this.identity);
  }

  getStatus(): Record<string, unknown> {
    const peers = this.getPeers();
    return {
      device: {
        id: this.identity.id,
        name: this.identity.name,
        type: this.identity.type,
        model: this.identity.model,
      },
      peers: peers.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        model: p.model,
        online: p.online,
        ip: p.ip,
        latencyMs: p.latencyMs,
        lastSeen: p.lastSeen,
      })),
      onlinePeers: peers.filter(p => p.online).length,
      totalPeers: peers.length,
      syncableFiles: SYNCABLE_FILES,
    };
  }

  // Context for the AI agent's system prompt
  toContextString(): string {
    const peers = this.getOnlinePeers();
    if (peers.length === 0) return '';

    const lines = [`\n## מכשירים מחוברים (${this.identity.name} — ${this.identity.type}):`];
    for (const p of peers) {
      lines.push(`- ${p.name} (${p.type}, ${p.model}) — ${p.online ? '🟢 מחובר' : '🔴 לא מחובר'}${p.latencyMs ? ` (${p.latencyMs}ms)` : ''}`);
    }
    lines.push('אתה יכול לשלוח הודעות והתראות למכשירים האחרים.');
    return lines.join('\n') + '\n';
  }
}
