import { execSync } from 'child_process';
import os from 'os';
import { ReminderService } from './reminders';

export interface BriefingData {
  greeting: string;
  time: string;
  date: string;
  battery: { percentage: number; status: string } | null;
  weather: string | null;
  reminders: { id: string; text: string; dueAt: string }[];
  overdueReminders: { id: string; text: string; dueAt: string }[];
  memoryUsage: number;
  unreadNotifications: number;
  tip: string;
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'לילה טוב 🌙';
  if (hour < 12) return 'בוקר טוב ☀️';
  if (hour < 17) return 'צהריים טובים 🌤️';
  if (hour < 21) return 'ערב טוב 🌅';
  return 'לילה טוב 🌙';
}

const TIPS = [
  'תגיד "תזכיר לי..." ואני אשלח לך התראה בזמן',
  'אפשר לשלוח לי תמונה ואני אנתח אותה',
  'תגיד "תחפש בקבצים..." ואני אמצא',
  'אני יכול לשלוח מיילים ו-SMS בשבילך',
  'אפשר לבקש ממני לארגן את הגלריה',
  'תגיד "מה מזג האוויר?" ואני אחפש',
  'אני יכול להריץ פקודות טרמינל',
  'תגיד "תיצור אוטומציה..." ואני אגדיר routine',
];

export function generateBriefing(reminderService: ReminderService): BriefingData {
  const now = new Date();

  const battery = safe(() => {
    const raw = execSync('termux-battery-status 2>/dev/null', { timeout: 5000 }).toString();
    return JSON.parse(raw);
  }, null);

  const weather = safe(() => {
    const raw = execSync('curl -s "wttr.in/?format=%c+%t" 2>/dev/null', { timeout: 5000 }).toString().trim();
    return raw.length > 0 && raw.length < 50 ? raw : null;
  }, null);

  const unreadNotifications = safe(() => {
    const raw = execSync('termux-notification-list 2>/dev/null', { timeout: 5000 }).toString();
    return JSON.parse(raw).length;
  }, 0);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    greeting: getGreeting(),
    time: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }),
    battery,
    weather,
    reminders: reminderService.getUpcoming(24).map(r => ({ id: r.id, text: r.text, dueAt: r.dueAt })),
    overdueReminders: reminderService.getOverdue().map(r => ({ id: r.id, text: r.text, dueAt: r.dueAt })),
    memoryUsage: Math.round(((totalMem - freeMem) / totalMem) * 100),
    unreadNotifications,
    tip: TIPS[Math.floor(Math.random() * TIPS.length)],
  };
}
