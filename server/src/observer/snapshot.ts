import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DeviceSnapshot {
  timestamp: string;
  battery: { percentage: number; status: string } | null;
  notifications: { app: string; title: string }[];
  clipboard: string;
  topProcesses: string[];
  memoryUsage: number; // percentage
  storageFreeMb: number;
  recentFiles: { name: string; path: string; modified: string }[];
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function takeSnapshot(): DeviceSnapshot {
  const now = new Date().toISOString();

  // Battery
  const battery = safe(() => {
    const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
    const data = JSON.parse(raw);
    return { percentage: data.percentage, status: data.status };
  }, null);

  // Notifications (last 10)
  const notifications = safe(() => {
    const raw = execSync('termux-notification-list 2>/dev/null', { timeout: 5000 }).toString();
    const list = JSON.parse(raw);
    return (list as any[]).slice(0, 10).map((n: any) => ({
      app: n.packageName || n.app || 'unknown',
      title: (n.title || '').substring(0, 80),
    }));
  }, []);

  // Clipboard
  const clipboard = safe(() => {
    return execSync('termux-clipboard-get 2>/dev/null', { timeout: 3000 })
      .toString()
      .substring(0, 200);
  }, '');

  // Top processes
  const topProcesses = safe(() => {
    const raw = execSync('ps aux --sort=-%mem 2>/dev/null | head -6', { timeout: 5000 }).toString();
    return raw.split('\n').slice(1).filter(Boolean).map(l => {
      const parts = l.trim().split(/\s+/);
      return parts[parts.length - 1] || '';
    });
  }, []);

  // Memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // Storage
  const storageFreeMb = safe(() => {
    const stat = (fs as any).statfsSync?.(process.env.HOME || os.homedir());
    return stat ? Math.round((stat.bsize * stat.bfree) / (1024 * 1024)) : -1;
  }, -1);

  // Recent files (last 5 modified in home)
  const recentFiles = safe(() => {
    const home = process.env.HOME || os.homedir();
    const raw = execSync(
      `find ${home} -maxdepth 3 -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name '.*' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -5`,
      { timeout: 5000 }
    ).toString();
    return raw.split('\n').filter(Boolean).map(line => {
      const [ts, ...pathParts] = line.split(' ');
      const filePath = pathParts.join(' ');
      return {
        name: path.basename(filePath),
        path: filePath,
        modified: new Date(parseFloat(ts) * 1000).toISOString(),
      };
    });
  }, []);

  return {
    timestamp: now,
    battery,
    notifications,
    clipboard,
    topProcesses,
    memoryUsage,
    storageFreeMb,
    recentFiles,
  };
}
