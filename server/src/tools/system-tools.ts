// Self-maintenance tools — invoked by the agent itself when the user asks
// for status, restart, or update. Wired into the registry from tool-handlers.ts.

import * as fs from 'fs';
import * as path from 'path';
import { restartCoordinator } from '../services/restart-coordinator';

const PKG_PATH = path.join(__dirname, '..', '..', 'package.json');

export function systemStatus(): string {
  let version = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    version = pkg.version || 'unknown';
  } catch {}

  const uptimeSec = Math.floor(process.uptime());
  const uptimeStr = formatDuration(uptimeSec);

  const mem = process.memoryUsage();
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
  const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);

  const supervised = process.env.MERLIN_SUPERVISED === '1';
  const last = restartCoordinator.getLastRestart();
  const lastStr = last
    ? `${new Date(last.completedAt).toLocaleString('he-IL')} (${last.wasGraceful ? 'תקין' : 'אחרי קריסה'})`
    : 'אין נתון';

  return [
    `🟢 מרלין רץ ובריא`,
    ``,
    `גרסה: ${version}`,
    `Uptime: ${uptimeStr}`,
    `זיכרון: RSS ${rssMb}MB, Heap ${heapMb}MB`,
    `מצב פיקוח: ${supervised ? '✅ supervised (יכול לעדכן את עצמו)' : '⚠️ standalone (אין hot-restart)'}`,
    `אתחול אחרון: ${lastStr}`,
    `Node: ${process.version}, Platform: ${process.platform}`,
  ].join('\n');
}

export function systemRestart(reason: string): string {
  if (process.env.MERLIN_SUPERVISED !== '1') {
    return `❌ אי אפשר לעשות restart נקי — אני לא רץ תחת supervisor. הפעל אותי דרך \`npm run start:supervised\` כדי להפעיל את היכולת הזו.`;
  }
  restartCoordinator.scheduleRestart(reason || 'user requested restart', 'restart', 'tool');
  return `🔄 נקבע אתחול: ${reason}\nאני שומר את כל השיחות הפתוחות. תרגיש פער של כ-3 שניות וחוזרים בדיוק מאיפה שהיינו.`;
}

export function systemUpdate(reason: string): string {
  if (process.env.MERLIN_SUPERVISED !== '1') {
    return `❌ אי אפשר לעדכן את עצמי — אני לא רץ תחת supervisor. הפעל אותי דרך \`npm run start:supervised\` כדי להפעיל את היכולת הזו.`;
  }
  restartCoordinator.scheduleRestart(reason || 'self-update requested', 'update', 'tool');
  return `🔧 נקבע עדכון: ${reason}\nשלבים: git pull → npm install → אתחול נקי. השיחה תישמר ותחזור אוטומטית. צפי: ~30 שניות.`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
