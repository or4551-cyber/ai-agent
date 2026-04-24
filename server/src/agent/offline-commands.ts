import { runCommand } from '../tools/terminal';
import * as termuxApi from '../tools/termux-api';

interface OfflineResult {
  handled: boolean;
  response: string;
}

interface CommandPattern {
  patterns: RegExp[];
  handler: (match: RegExpMatchArray, input: string) => Promise<string>;
}

const COMMANDS: CommandPattern[] = [
  // Battery
  {
    patterns: [/^(סוללה|battery|בטרייה|כמה סוללה|מצב סוללה)/i],
    handler: async () => termuxApi.getBattery(),
  },
  // Time
  {
    patterns: [/^(שעה|זמן|time|מה השעה|תאריך|date)/i],
    handler: async () => {
      const now = new Date();
      const time = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const date = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `🕐 ${time}\n📅 ${date}`;
    },
  },
  // Notifications
  {
    patterns: [/^(התראות|notifications|הודעות|נוטיפיקציות)/i],
    handler: async () => termuxApi.getNotifications(),
  },
  // Clipboard
  {
    patterns: [/^(clipboard|לוח|קליפבורד|מה הועתק|העתק)/i],
    handler: async () => {
      const text = await termuxApi.getClipboard();
      return text ? `📋 בלוח: ${text}` : '📋 הלוח ריק';
    },
  },
  // Flashlight
  {
    patterns: [/^(פנס|flashlight|תדליק פנס|תכבה פנס|torch)/i],
    handler: async (_m, input) => {
      const off = /כב|off|סגור/i.test(input);
      await runCommand(`termux-torch ${off ? 'off' : 'on'}`, undefined, 3000);
      return off ? '🔦 פנס כבוי' : '🔦 פנס דלוק!';
    },
  },
  // WiFi
  {
    patterns: [/^(wifi|וייפיי|אינטרנט|רשת|חיבור)/i],
    handler: async () => {
      try {
        const raw = await runCommand('termux-wifi-connectioninfo 2>/dev/null', undefined, 5000);
        const info = JSON.parse(raw);
        if (info.supplicant_state === 'COMPLETED') {
          return `📶 WiFi מחובר\nSSID: ${info.ssid}\nIP: ${info.ip}`;
        }
        return '📵 WiFi לא מחובר';
      } catch {
        return '📵 לא הצלחתי לבדוק WiFi';
      }
    },
  },
  // Photo
  {
    patterns: [/^(צלם|תצלם|photo|תמונה|צילום)/i],
    handler: async () => termuxApi.takePhoto(),
  },
  // Record
  {
    patterns: [/^(הקלט|תקליט|record|הקלטה)/i],
    handler: async (_m, input) => {
      const durMatch = input.match(/(\d+)\s*(שניות|seconds|sec|שנ)/i);
      const dur = durMatch ? parseInt(durMatch[1]) : 10;
      return termuxApi.recordAudio(dur);
    },
  },
  // Sensors
  {
    patterns: [/^(חיישנים|sensors|חיישן)/i],
    handler: async () => termuxApi.getSensors(),
  },
  // Location
  {
    patterns: [/^(מיקום|location|איפה אני|GPS)/i],
    handler: async () => termuxApi.getLocation(),
  },
  // Contacts
  {
    patterns: [/^(אנשי קשר|contacts|טלפון של)/i],
    handler: async (_m, input) => {
      const search = input.replace(/^(אנשי קשר|contacts|טלפון של)\s*/i, '').trim();
      return termuxApi.getContacts(search || undefined);
    },
  },
  // Volume
  {
    patterns: [/^(ווליום|volume|עוצמה|שקט|silent|mute)/i],
    handler: async (_m, input) => {
      if (/שקט|silent|mute|השתק/i.test(input)) {
        await runCommand('termux-volume ring 0', undefined, 2000);
        await runCommand('termux-volume notification 0', undefined, 2000);
        return '🔇 מצב שקט הופעל';
      }
      return termuxApi.mediaVolume(undefined);
    },
  },
  // Storage / disk
  {
    patterns: [/^(אחסון|storage|דיסק|כמה מקום|שטח)/i],
    handler: async () => {
      const raw = await runCommand('df -h /data 2>/dev/null | tail -1', undefined, 3000);
      const parts = raw.trim().split(/\s+/);
      if (parts.length >= 4) {
        return `💾 אחסון:\nסה"כ: ${parts[1]}\nבשימוש: ${parts[2]} (${parts[4]})\nפנוי: ${parts[3]}`;
      }
      return raw || 'לא הצלחתי לבדוק אחסון';
    },
  },
  // Processes / memory
  {
    patterns: [/^(זיכרון|memory|ram|תהליכים|processes)/i],
    handler: async () => {
      const raw = await runCommand('free -h 2>/dev/null | head -2', undefined, 3000);
      return `💾 זיכרון:\n${raw.trim()}`;
    },
  },
];

export function tryOfflineCommand(userMessage: string): Promise<OfflineResult> | null {
  const trimmed = userMessage.trim();
  
  for (const cmd of COMMANDS) {
    for (const pattern of cmd.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return cmd.handler(match, trimmed)
          .then(response => ({ handled: true, response: `⚡ ${response}` }))
          .catch(err => ({ handled: true, response: `❌ שגיאה: ${(err as Error).message}` }));
      }
    }
  }
  
  return null;
}
