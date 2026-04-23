import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

export interface Reminder {
  id: string;
  text: string;
  dueAt: string; // ISO
  createdAt: string;
  done: boolean;
  notified: boolean;
}

export class ReminderService {
  private reminders: Reminder[] = [];
  private checkTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  private load(): void {
    try {
      if (fs.existsSync(REMINDERS_FILE)) {
        this.reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));
      }
    } catch { this.reminders = []; }
  }

  private save(): void {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(this.reminders, null, 2), 'utf-8');
  }

  start(): void {
    // Check every minute for due reminders
    this.checkTimer = setInterval(() => this.checkDue(), 60 * 1000);
    console.log('[Reminders] Service started');
  }

  stop(): void {
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  add(text: string, dueAt: Date): Reminder {
    const reminder: Reminder = {
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      dueAt: dueAt.toISOString(),
      createdAt: new Date().toISOString(),
      done: false,
      notified: false,
    };
    this.reminders.push(reminder);
    this.save();
    return reminder;
  }

  complete(id: string): boolean {
    const r = this.reminders.find(r => r.id === id);
    if (r) { r.done = true; this.save(); return true; }
    return false;
  }

  delete(id: string): boolean {
    const before = this.reminders.length;
    this.reminders = this.reminders.filter(r => r.id !== id);
    if (this.reminders.length !== before) { this.save(); return true; }
    return false;
  }

  list(includeCompleted = false): Reminder[] {
    return this.reminders
      .filter(r => includeCompleted || !r.done)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  getUpcoming(hours = 24): Reminder[] {
    const cutoff = new Date(Date.now() + hours * 3600000).toISOString();
    return this.list().filter(r => r.dueAt <= cutoff);
  }

  getOverdue(): Reminder[] {
    const now = new Date().toISOString();
    return this.list().filter(r => r.dueAt <= now && !r.done);
  }

  private checkDue(): void {
    const now = new Date();
    for (const r of this.reminders) {
      if (r.done || r.notified) continue;
      if (new Date(r.dueAt) <= now) {
        r.notified = true;
        this.sendNotification(r);
      }
    }
    this.save();
  }

  private sendNotification(r: Reminder): void {
    try {
      const { execSync } = require('child_process');
      execSync(
        `termux-notification --title "⏰ Reminder" --content "${r.text.replace(/"/g, '\\"')}" --id "rem-${r.id}" 2>/dev/null`,
        { timeout: 5000 }
      );
      console.log(`[Reminders] Notified: ${r.text}`);
    } catch {
      console.log(`[Reminders] Due: ${r.text} (notification failed — not on Termux)`);
    }
  }
}
