import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DeviceScanner, ProximityStatus } from './device-scanner';
import { HealthMonitor, HealthStatus } from './health-monitor';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const STATE_FILE = path.join(DATA_DIR, 'proactive-state.json');
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export interface ProactiveAction {
  id: string;
  type: ProactiveType;
  title: string;
  message: string;
  timestamp: string;
  dismissed: boolean;
  aiGenerated: boolean;
  suggestedAction?: string;
}

export type ProactiveType =
  | 'meeting_reminder'
  | 'weather_alert'
  | 'commute_time'
  | 'overdue_reminder'
  | 'daily_summary'
  | 'battery_suggestion'
  | 'usage_insight'
  | 'good_morning'
  | 'good_night'
  | 'wellbeing_check'
  | 'health_alert'
  | 'sedentary_alert';

interface ProactiveState {
  lastMorning: string | null;
  lastNight: string | null;
  lastDailySummary: string | null;
  lastCalendarCheck: string | null;
  notifiedMeetings: string[];
  lastWellbeingCheck: string | null;
  lastSedentaryAlert: string | null;
}

export class ProactiveAgentService {
  private timer: NodeJS.Timeout | null = null;
  private actions: ProactiveAction[] = [];
  private state: ProactiveState;
  private onNotify: ((action: ProactiveAction) => void) | null = null;
  private onAiPrompt: ((prompt: string) => Promise<string>) | null = null;
  private deviceScanner: DeviceScanner;
  private healthMonitor: HealthMonitor;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.state = this.loadState();
    this.deviceScanner = new DeviceScanner();
    this.healthMonitor = new HealthMonitor();
  }

  private loadState(): ProactiveState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      }
    } catch {}
    return { lastMorning: null, lastNight: null, lastDailySummary: null, lastCalendarCheck: null, notifiedMeetings: [], lastWellbeingCheck: null, lastSedentaryAlert: null };
  }

  private saveState(): void {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2)); } catch {}
  }

  setNotifyHandler(handler: (action: ProactiveAction) => void): void {
    this.onNotify = handler;
  }

  setAiHandler(handler: (prompt: string) => Promise<string>): void {
    this.onAiPrompt = handler;
  }

  start(): void {
    if (this.timer) return;
    console.log('[ProactiveAgent] Starting (check every 2 min)');
    this.deviceScanner.start();
    this.healthMonitor.start();
    // Defer first check so execSync calls don't block server startup
    setTimeout(() => this.check(), 15000);
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.deviceScanner.stop();
    this.healthMonitor.stop();
  }

  getActions(limit = 20): ProactiveAction[] {
    return this.actions.filter(a => !a.dismissed).slice(0, limit);
  }

  dismiss(id: string): void {
    const action = this.actions.find(a => a.id === id);
    if (action) action.dismissed = true;
  }

  private push(action: Omit<ProactiveAction, 'id' | 'timestamp' | 'dismissed'>): void {
    const newAction: ProactiveAction = {
      ...action,
      id: `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      dismissed: false,
    };
    this.actions.unshift(newAction);
    this.actions = this.actions.slice(0, 50);

    // Push notification
    try {
      const titleEsc = action.title.replace(/"/g, '\\"');
      const msgEsc = action.message.substring(0, 200).replace(/"/g, '\\"');
      execSync(
        `termux-notification --title "${titleEsc}" --content "${msgEsc}" --id "proactive-${action.type}" --priority high 2>/dev/null`,
        { timeout: 5000 }
      );
    } catch {}

    if (this.onNotify) this.onNotify(newAction);
    console.log(`[ProactiveAgent] ${action.title}`);
  }

  private async check(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toDateString();

    // Good morning (6-9 AM, once per day)
    if (hour >= 6 && hour <= 9 && this.state.lastMorning !== today) {
      this.state.lastMorning = today;
      this.saveState();
      await this.goodMorning();
    }

    // Good night reminder (22-23, once per day)
    if (hour >= 22 && hour <= 23 && this.state.lastNight !== today) {
      this.state.lastNight = today;
      this.saveState();
      this.goodNight();
    }

    // Calendar — upcoming meetings (check every cycle)
    this.checkUpcomingMeetings();

    // Overdue reminders
    this.checkOverdueReminders();

    // Battery-based suggestions
    this.checkBatterySuggestions();

    // Wellbeing check (alone + health anomalies)
    this.checkWellbeing();

    // Sedentary alert
    this.checkSedentary();
  }

  private async goodMorning(): Promise<void> {
    if (this.onAiPrompt) {
      try {
        const briefing = await this.onAiPrompt(
          'תן לי סיכום בוקר קצר: מה מצב הסוללה, מה יש בלוח השנה היום, האם יש תזכורות. תענה בעברית ב-2-3 משפטים קצרים.'
        );
        this.push({
          type: 'good_morning',
          title: '🌅 בוקר טוב!',
          message: briefing.substring(0, 300),
          aiGenerated: true,
        });
      } catch {
        this.push({
          type: 'good_morning',
          title: '🌅 בוקר טוב!',
          message: 'יום חדש התחיל. בוא נבדוק מה יש היום.',
          aiGenerated: false,
        });
      }
    } else {
      this.push({
        type: 'good_morning',
        title: '🌅 בוקר טוב!',
        message: 'יום חדש התחיל. שאל אותי מה יש בלוח השנה או מה מצב הסוללה.',
        aiGenerated: false,
      });
    }
  }

  private goodNight(): void {
    const battery = safe(() => {
      const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
      return JSON.parse(raw) as { percentage: number; status: string };
    }, null);

    let msg = 'לילה טוב! ';
    if (battery) {
      if (battery.percentage < 30 && battery.status !== 'CHARGING') {
        msg += `הסוללה ב-${battery.percentage}% — כדאי לחבר למטען לפני השינה.`;
      } else {
        msg += `הסוללה ב-${battery.percentage}%${battery.status === 'CHARGING' ? ' (בטעינה)' : ''}.`;
      }
    }

    this.push({
      type: 'good_night',
      title: '🌙 לילה טוב',
      message: msg,
      aiGenerated: false,
    });
  }

  private checkUpcomingMeetings(): void {
    const events = safe(() => {
      const raw = execSync(
        'termux-calendar-list -d 1 2>/dev/null || echo ""',
        { timeout: 8000 }
      ).toString();
      if (!raw || raw.trim() === '') return [];
      try {
        return JSON.parse(raw) as { title: string; dtstart: number; dtend: number; eventId: number }[];
      } catch { return []; }
    }, []);

    const now = Date.now();
    for (const event of events) {
      if (!event.dtstart || !event.title) continue;
      const diff = event.dtstart - now;
      const eventKey = `${event.eventId || event.title}-${new Date(event.dtstart).toDateString()}`;

      // 30 min warning
      if (diff > 0 && diff <= 30 * 60 * 1000 && !this.state.notifiedMeetings.includes(eventKey)) {
        this.state.notifiedMeetings.push(eventKey);
        // Clean old entries
        this.state.notifiedMeetings = this.state.notifiedMeetings.slice(-50);
        this.saveState();

        const minutes = Math.round(diff / 60000);
        this.push({
          type: 'meeting_reminder',
          title: '📅 פגישה קרובה',
          message: `"${event.title}" בעוד ${minutes} דקות`,
          aiGenerated: false,
          suggestedAction: 'calendar_list',
        });
      }
    }
  }

  private checkOverdueReminders(): void {
    try {
      const remindersFile = path.join(DATA_DIR, 'reminders.json');
      if (!fs.existsSync(remindersFile)) return;
      const reminders = JSON.parse(fs.readFileSync(remindersFile, 'utf-8')) as {
        id: string; text: string; dueAt: string; done: boolean; notified: boolean;
      }[];

      const now = new Date();
      const overdue = reminders.filter(r => !r.done && new Date(r.dueAt) < now);
      if (overdue.length > 0) {
        // Only notify once per hour about overdue
        const lastOverdueAction = this.actions.find(a => a.type === 'overdue_reminder' && !a.dismissed);
        if (lastOverdueAction) {
          const age = Date.now() - new Date(lastOverdueAction.timestamp).getTime();
          if (age < 60 * 60 * 1000) return;
        }

        this.push({
          type: 'overdue_reminder',
          title: '⏰ תזכורות שעבר זמנן',
          message: `יש לך ${overdue.length} תזכורות שעבר זמנן: ${overdue.slice(0, 3).map(r => r.text).join(', ')}`,
          aiGenerated: false,
          suggestedAction: 'reminder_list',
        });
      }
    } catch {}
  }

  // ===== WELLBEING CHECK =====
  private async checkWellbeing(): Promise<void> {
    const proximity = this.deviceScanner.getProximityStatus();
    const health = this.healthMonitor.getHealthStatus();

    // Only check if we have meaningful data
    if (proximity.nearbyDeviceCount === -1) return;

    // Condition: alone for > 2 hours AND (abnormal heart rate OR high stress)
    const aloneHours = proximity.aloneMinutes / 60;
    const healthConcern = health.isHeartRateAbnormal || health.stressLevel === 'high';
    const aloneAndConcerning = aloneHours >= 2 && healthConcern;

    // Condition: alone for > 6 hours (even without health data)
    const longAlone = aloneHours >= 6;

    if (!aloneAndConcerning && !longAlone) return;

    // Rate limit: max once every 2 hours
    const lastCheck = this.state.lastWellbeingCheck;
    if (lastCheck && Date.now() - new Date(lastCheck).getTime() < 2 * 60 * 60 * 1000) return;

    this.state.lastWellbeingCheck = new Date().toISOString();
    this.saveState();

    // Build context-aware message
    let reason = '';
    if (aloneAndConcerning) {
      const hrPart = health.currentHeartRate ? `\u05d4\u05d3\u05d5\u05e4\u05e7 \u05e9\u05dc\u05da ${health.currentHeartRate}` : '';
      const stressPart = health.stressLevel === 'high' ? '\u05d5\u05e0\u05e8\u05d0\u05d4 \u05e9\u05d0\u05ea\u05d4 \u05d1\u05dc\u05d7\u05e5' : '';
      reason = `${hrPart}${hrPart && stressPart ? ' ' : ''}${stressPart}. \u05d0\u05ea\u05d4 \u05dc\u05d1\u05d3 \u05db\u05d1\u05e8 ${Math.round(aloneHours)} \u05e9\u05e2\u05d5\u05ea.`;
    } else {
      reason = `\u05d0\u05ea\u05d4 \u05dc\u05d1\u05d3 \u05db\u05d1\u05e8 ${Math.round(aloneHours)} \u05e9\u05e2\u05d5\u05ea. \u05e8\u05e6\u05d9\u05ea\u05d9 \u05dc\u05d1\u05d3\u05d5\u05e7 \u05e9\u05d4\u05db\u05dc \u05d1\u05e1\u05d3\u05e8.`;
    }

    // If AI is available, generate a caring message
    if (this.onAiPrompt && aloneAndConcerning) {
      try {
        const prompt = `\u05d4\u05de\u05e9\u05ea\u05de\u05e9 \u05dc\u05d1\u05d3 \u05db\u05d1\u05e8 ${Math.round(aloneHours)} \u05e9\u05e2\u05d5\u05ea` +
          (health.currentHeartRate ? `, \u05d3\u05d5\u05e4\u05e7: ${health.currentHeartRate}` : '') +
          (health.stressLevel !== 'unknown' ? `, \u05e8\u05de\u05ea \u05dc\u05d7\u05e5: ${health.stressLevel}` : '') +
          `. \u05ea\u05e9\u05d0\u05dc \u05d0\u05d5\u05ea\u05d5 \u05d1\u05d7\u05de\u05d9\u05de\u05d5\u05ea \u05d0\u05dd \u05d4\u05db\u05dc \u05d1\u05e1\u05d3\u05e8, \u05d1\u05de\u05e9\u05e4\u05d8 \u05d0\u05d7\u05d3 \u05e7\u05e6\u05e8 \u05d1\u05e2\u05d1\u05e8\u05d9\u05ea. \u05ea\u05d4\u05d9\u05d4 \u05d0\u05e0\u05d5\u05e9\u05d9 \u05d5\u05d7\u05dd, \u05dc\u05d0 \u05e8\u05d5\u05d1\u05d5\u05d8\u05d9.`;
        const response = await this.onAiPrompt(prompt);
        this.push({
          type: 'wellbeing_check',
          title: '\ud83d\udc9a \u05d0\u05d9\u05da \u05d0\u05ea\u05d4 \u05de\u05e8\u05d2\u05d9\u05e9?',
          message: response.substring(0, 300),
          aiGenerated: true,
          suggestedAction: 'voice_chat',
        });
        return;
      } catch {}
    }

    this.push({
      type: 'wellbeing_check',
      title: '\ud83d\udc9a \u05d0\u05d9\u05da \u05d0\u05ea\u05d4?',
      message: reason,
      aiGenerated: false,
      suggestedAction: 'voice_chat',
    });
  }

  // ===== SEDENTARY ALERT =====
  private checkSedentary(): void {
    const health = this.healthMonitor.getHealthStatus();
    if (health.sedentaryMinutes < 90) return; // Only alert after 90 min

    // Rate limit: once every 2 hours
    const lastAlert = this.state.lastSedentaryAlert;
    if (lastAlert && Date.now() - new Date(lastAlert).getTime() < 2 * 60 * 60 * 1000) return;

    this.state.lastSedentaryAlert = new Date().toISOString();
    this.saveState();

    this.push({
      type: 'sedentary_alert',
      title: '\ud83e\uddd8 \u05d4\u05d2\u05d9\u05e2 \u05d4\u05d6\u05de\u05df \u05dc\u05d6\u05d5\u05d6',
      message: `\u05d0\u05ea\u05d4 \u05dc\u05d0 \u05d6\u05d6\u05ea \u05db\u05d1\u05e8 ${health.sedentaryMinutes} \u05d3\u05e7\u05d5\u05ea. \u05e7\u05d5\u05dd \u05dc\u05de\u05ea\u05d9\u05d7\u05d4 \u05e7\u05e6\u05e8\u05d4!`,
      aiGenerated: false,
    });
  }

  // ===== GETTERS FOR NEW SERVICES =====
  getDeviceScanner(): DeviceScanner { return this.deviceScanner; }
  getHealthMonitor(): HealthMonitor { return this.healthMonitor; }

  private checkBatterySuggestions(): void {
    const battery = safe(() => {
      const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
      return JSON.parse(raw) as { percentage: number; status: string; temperature: number };
    }, null);

    if (!battery) return;

    // High temperature warning
    if (battery.temperature && battery.temperature > 40) {
      const recent = this.actions.find(a => a.type === 'battery_suggestion' && !a.dismissed);
      if (!recent || Date.now() - new Date(recent.timestamp).getTime() > 30 * 60 * 1000) {
        this.push({
          type: 'battery_suggestion',
          title: '🌡️ טמפרטורת סוללה גבוהה',
          message: `הסוללה ב-${battery.temperature}°C. כדאי להוריד בהירות ולסגור אפליקציות כבדות.`,
          aiGenerated: false,
        });
      }
    }
  }
}
