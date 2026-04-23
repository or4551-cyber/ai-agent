import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const ALERTS_FILE = path.join(DATA_DIR, 'smart-alerts.json');
const CHECK_INTERVAL = 3 * 60 * 1000; // Check every 3 minutes

export interface SmartAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  actionable: boolean;
  action?: string;
}

export type AlertType =
  | 'battery_low'
  | 'battery_full'
  | 'storage_low'
  | 'large_download'
  | 'notification_spam'
  | 'high_memory'
  | 'reminder_soon'
  | 'routine_failed';

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export class SmartAlertsService {
  private alerts: SmartAlert[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastBatteryLevel = -1;
  private lastFreeStorageMb = -1;
  private spamTracker: Map<string, number> = new Map();
  private onAlert: ((alert: SmartAlert) => void) | null = null;

  constructor() {
    this.ensureDir();
    this.loadAlerts();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  private loadAlerts(): void {
    try {
      if (fs.existsSync(ALERTS_FILE)) {
        this.alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf-8'));
      }
    } catch { this.alerts = []; }
  }

  private saveAlerts(): void {
    try {
      // Keep last 100 alerts
      this.alerts = this.alerts.slice(0, 100);
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(this.alerts, null, 2), 'utf-8');
    } catch {}
  }

  setAlertHandler(handler: (alert: SmartAlert) => void): void {
    this.onAlert = handler;
  }

  start(): void {
    if (this.timer) return;
    console.log('[SmartAlerts] Starting background alert checks (every 3 min)');
    this.checkAll();
    this.timer = setInterval(() => this.checkAll(), CHECK_INTERVAL);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getAlerts(unreadOnly = false): SmartAlert[] {
    if (unreadOnly) return this.alerts.filter(a => !a.read);
    return this.alerts;
  }

  getUnreadCount(): number {
    return this.alerts.filter(a => !a.read).length;
  }

  markRead(id: string): void {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) { alert.read = true; this.saveAlerts(); }
  }

  markAllRead(): void {
    this.alerts.forEach(a => a.read = true);
    this.saveAlerts();
  }

  private pushAlert(alert: Omit<SmartAlert, 'id' | 'timestamp' | 'read'>): void {
    // Avoid duplicate alerts within 30 minutes
    const recentSame = this.alerts.find(
      a => a.type === alert.type && !a.read &&
      Date.now() - new Date(a.timestamp).getTime() < 30 * 60 * 1000
    );
    if (recentSame) return;

    const newAlert: SmartAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.alerts.unshift(newAlert);
    this.saveAlerts();

    // Termux notification
    try {
      execSync(
        `termux-notification --title "${alert.title}" --content "${alert.message}" --id "smart-${alert.type}" 2>/dev/null`,
        { timeout: 5000 }
      );
    } catch {}

    // Callback to WebSocket etc.
    if (this.onAlert) {
      this.onAlert(newAlert);
    }

    console.log(`[SmartAlerts] 🔔 ${alert.title}: ${alert.message}`);
  }

  private checkAll(): void {
    this.checkBattery();
    this.checkStorage();
    this.checkMemory();
    this.checkNotificationSpam();
    this.checkLargeDownloads();
  }

  private checkBattery(): void {
    const battery = safe(() => {
      const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
      return JSON.parse(raw) as { percentage: number; status: string };
    }, null);

    if (!battery) return;

    // Battery low
    if (battery.percentage <= 15 && battery.status !== 'CHARGING' && this.lastBatteryLevel > 15) {
      this.pushAlert({
        type: 'battery_low',
        title: '🔋 סוללה נמוכה',
        message: `הסוללה ב-${battery.percentage}%. כדאי לחבר למטען.`,
        priority: 'high',
        actionable: false,
      });
    }

    // Battery full (stop charging)
    if (battery.percentage >= 100 && battery.status === 'CHARGING' && this.lastBatteryLevel < 100) {
      this.pushAlert({
        type: 'battery_full',
        title: '🔌 הסוללה מלאה',
        message: 'הסוללה הגיעה ל-100%. כדאי לנתק את המטען.',
        priority: 'low',
        actionable: false,
      });
    }

    this.lastBatteryLevel = battery.percentage;
  }

  private checkStorage(): void {
    const freeMb = safe(() => {
      const raw = execSync(`df /storage/emulated/0 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
      const parts = raw.trim().split(/\s+/);
      return Math.round(parseInt(parts[3] || '0') / 1024);
    }, -1);

    if (freeMb < 0) return;

    if (freeMb < 500 && (this.lastFreeStorageMb === -1 || this.lastFreeStorageMb >= 500)) {
      this.pushAlert({
        type: 'storage_low',
        title: '💾 מקום פנוי נמוך',
        message: `נותרו רק ${freeMb} MB באחסון. כדאי לפנות מקום.`,
        priority: 'high',
        actionable: true,
        action: 'storage_scan',
      });
    }

    this.lastFreeStorageMb = freeMb;
  }

  private checkMemory(): void {
    const os = require('os');
    const usedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);

    if (usedPct > 90) {
      this.pushAlert({
        type: 'high_memory',
        title: '⚡ זיכרון RAM גבוה',
        message: `שימוש ב-${usedPct}% מה-RAM. יישומים עלולים להיות איטיים.`,
        priority: 'medium',
        actionable: false,
      });
    }
  }

  private checkNotificationSpam(): void {
    const notifications = safe(() => {
      const raw = execSync('termux-notification-list 2>/dev/null', { timeout: 5000 }).toString();
      return JSON.parse(raw) as { packageName: string; title: string }[];
    }, []);

    // Count notifications per app
    const appCounts = new Map<string, number>();
    for (const n of notifications) {
      const pkg = n.packageName || 'unknown';
      appCounts.set(pkg, (appCounts.get(pkg) || 0) + 1);
    }

    for (const [app, count] of appCounts) {
      if (count >= 10) {
        const prevCount = this.spamTracker.get(app) || 0;
        if (prevCount < 10) {
          const appName = app.split('.').pop() || app;
          this.pushAlert({
            type: 'notification_spam',
            title: '🔕 ספאם התראות',
            message: `${appName} שלח ${count} התראות. שקול להשתיק.`,
            priority: 'medium',
            actionable: false,
          });
        }
      }
      this.spamTracker.set(app, count);
    }
  }

  private checkLargeDownloads(): void {
    const downloads = safe(() => {
      const raw = execSync(
        `find /storage/emulated/0/Download -type f -mmin -10 -size +50M -printf '%s\\t%f\\n' 2>/dev/null`,
        { timeout: 5000 }
      ).toString();
      return raw.split('\n').filter(Boolean).map(line => {
        const [size, name] = line.split('\t');
        return { name, sizeMb: Math.round(parseInt(size || '0') / (1024 * 1024)) };
      });
    }, []);

    for (const file of downloads) {
      this.pushAlert({
        type: 'large_download',
        title: '📥 קובץ גדול הורד',
        message: `${file.name} (${file.sizeMb} MB) ירד לתיקיית Downloads.`,
        priority: 'low',
        actionable: false,
      });
    }
  }
}
