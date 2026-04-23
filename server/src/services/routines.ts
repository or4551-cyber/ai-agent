import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const ROUTINES_FILE = path.join(DATA_DIR, 'routines.json');

export interface Routine {
  id: string;
  name: string;
  schedule: string; // "daily:07:00", "weekly:mon:09:00", "hourly"
  action: RoutineAction;
  enabled: boolean;
  lastRun: string | null;
  createdAt: string;
}

export type RoutineAction =
  | { type: 'command'; command: string }
  | { type: 'notification'; title: string; message: string }
  | { type: 'ai_prompt'; prompt: string }; // Will be processed by agent

export class RoutineService {
  private routines: Routine[] = [];
  private checkTimer: NodeJS.Timeout | null = null;
  private onAiPrompt: ((prompt: string) => Promise<string>) | null = null;

  constructor() {
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  private load(): void {
    try {
      if (fs.existsSync(ROUTINES_FILE)) {
        this.routines = JSON.parse(fs.readFileSync(ROUTINES_FILE, 'utf-8'));
      }
    } catch { this.routines = []; }
  }

  private save(): void {
    fs.writeFileSync(ROUTINES_FILE, JSON.stringify(this.routines, null, 2), 'utf-8');
  }

  setAiHandler(handler: (prompt: string) => Promise<string>): void {
    this.onAiPrompt = handler;
  }

  start(): void {
    // Check every minute
    this.checkTimer = setInterval(() => this.tick(), 60 * 1000);
    console.log('[Routines] Service started');
  }

  stop(): void {
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  add(name: string, schedule: string, action: RoutineAction): Routine {
    const routine: Routine = {
      id: `routine-${Date.now()}`,
      name,
      schedule,
      action,
      enabled: true,
      lastRun: null,
      createdAt: new Date().toISOString(),
    };
    this.routines.push(routine);
    this.save();
    return routine;
  }

  remove(id: string): boolean {
    const before = this.routines.length;
    this.routines = this.routines.filter(r => r.id !== id);
    if (this.routines.length !== before) { this.save(); return true; }
    return false;
  }

  toggle(id: string): boolean {
    const r = this.routines.find(r => r.id === id);
    if (r) { r.enabled = !r.enabled; this.save(); return true; }
    return false;
  }

  list(): Routine[] {
    return this.routines;
  }

  private tick(): void {
    const now = new Date();
    for (const r of this.routines) {
      if (!r.enabled) continue;
      if (this.shouldRun(r, now)) {
        this.execute(r);
        r.lastRun = now.toISOString();
      }
    }
    this.save();
  }

  private shouldRun(routine: Routine, now: Date): boolean {
    const schedule = routine.schedule;
    const lastRun = routine.lastRun ? new Date(routine.lastRun) : null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (schedule === 'hourly') {
      if (!lastRun) return now.getMinutes() === 0;
      return (now.getTime() - lastRun.getTime()) >= 3600000;
    }

    if (schedule.startsWith('daily:')) {
      const [, time] = schedule.split(':');
      const [h, m] = (time + ':00').split(':').map(Number);
      const target = h * 60 + (m || 0);
      if (Math.abs(nowMinutes - target) > 1) return false;
      if (lastRun && now.toDateString() === lastRun.toDateString()) return false;
      return true;
    }

    if (schedule.startsWith('weekly:')) {
      const parts = schedule.split(':');
      const day = parts[1].toLowerCase();
      const [h, m] = (parts[2] + ':00').split(':').map(Number);
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      if (days[now.getDay()] !== day) return false;
      const target = h * 60 + (m || 0);
      if (Math.abs(nowMinutes - target) > 1) return false;
      if (lastRun && now.toDateString() === lastRun.toDateString()) return false;
      return true;
    }

    return false;
  }

  private async execute(routine: Routine): Promise<void> {
    console.log(`[Routines] Executing: ${routine.name}`);
    try {
      switch (routine.action.type) {
        case 'command':
          execSync(routine.action.command, { timeout: 30000 });
          break;

        case 'notification':
          try {
            execSync(
              `termux-notification --title "${routine.action.title.replace(/"/g, '\\"')}" --content "${routine.action.message.replace(/"/g, '\\"')}" --id "routine-${routine.id}" 2>/dev/null`,
              { timeout: 5000 }
            );
          } catch {}
          break;

        case 'ai_prompt':
          if (this.onAiPrompt) {
            const result = await this.onAiPrompt(routine.action.prompt);
            // Send result as notification
            try {
              execSync(
                `termux-notification --title "${routine.name.replace(/"/g, '\\"')}" --content "${result.substring(0, 200).replace(/"/g, '\\"')}" --id "routine-${routine.id}" 2>/dev/null`,
                { timeout: 5000 }
              );
            } catch {}
          }
          break;
      }
    } catch (err) {
      console.error(`[Routines] Error executing ${routine.name}:`, (err as Error).message);
    }
  }
}
