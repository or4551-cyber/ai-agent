import { runCommand } from './terminal';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const SCREENSHOT_PATH = path.join(DATA_DIR, 'screen.png');
const UI_DUMP_PATH = '/data/local/tmp/ui-dump.xml';

// ===== CORE: Screen Interaction =====

export async function uiTap(x: number, y: number): Promise<string> {
  await runCommand(`input tap ${Math.round(x)} ${Math.round(y)}`, undefined, 5000);
  return `Tapped at (${x}, ${y})`;
}

export async function uiTapByText(text: string): Promise<string> {
  const dump = await uiDumpScreen();
  const regex = new RegExp(`text="[^"]*${escapeRegex(text)}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
  const match = dump.match(regex);
  if (!match) {
    return `לא מצאתי אלמנט עם הטקסט "${text}" על המסך`;
  }
  const x = (parseInt(match[1]) + parseInt(match[3])) / 2;
  const y = (parseInt(match[2]) + parseInt(match[4])) / 2;
  await runCommand(`input tap ${Math.round(x)} ${Math.round(y)}`, undefined, 5000);
  return `Tapped on "${text}" at (${Math.round(x)}, ${Math.round(y)})`;
}

export async function uiType(text: string): Promise<string> {
  // Android input text doesn't handle spaces well — replace with %s
  const escaped = text.replace(/ /g, '%s').replace(/[&|<>]/g, '');
  await runCommand(`input text "${escaped}"`, undefined, 5000);
  return `Typed: "${text}"`;
}

export async function uiSwipe(direction: 'up' | 'down' | 'left' | 'right', duration = 300): Promise<string> {
  // Approximate center of screen (1080x2400 default, adjust as needed)
  const cx = 540, cy = 1200;
  const dist = 800;
  const coords: Record<string, string> = {
    up: `${cx} ${cy + dist / 2} ${cx} ${cy - dist / 2}`,
    down: `${cx} ${cy - dist / 2} ${cx} ${cy + dist / 2}`,
    left: `${cx + dist / 2} ${cy} ${cx - dist / 2} ${cy}`,
    right: `${cx - dist / 2} ${cy} ${cx + dist / 2} ${cy}`,
  };
  await runCommand(`input swipe ${coords[direction]} ${duration}`, undefined, 5000);
  return `Swiped ${direction}`;
}

export async function uiKeyEvent(keycode: string): Promise<string> {
  await runCommand(`input keyevent ${keycode}`, undefined, 5000);
  return `Key event: ${keycode}`;
}

export async function uiBack(): Promise<string> {
  return uiKeyEvent('KEYCODE_BACK');
}

export async function uiHome(): Promise<string> {
  return uiKeyEvent('KEYCODE_HOME');
}

export async function uiRecent(): Promise<string> {
  return uiKeyEvent('KEYCODE_APP_SWITCH');
}

// ===== SCREEN READING =====

export async function uiDumpScreen(): Promise<string> {
  try {
    await runCommand(`uiautomator dump ${UI_DUMP_PATH} 2>/dev/null`, undefined, 10000);
    const xml = await runCommand(`cat ${UI_DUMP_PATH}`, undefined, 5000);
    return xml;
  } catch {
    return 'לא ניתן לקרוא את המסך — ייתכן שצריך הרשאות או uiautomator לא זמין';
  }
}

export async function uiReadScreen(): Promise<string> {
  const xml = await uiDumpScreen();
  if (xml.startsWith('לא ניתן')) return xml;

  // Parse XML into readable text
  const elements: string[] = [];
  const regex = /class="([^"]*)"[^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const [, className, text, contentDesc, x1, y1, x2, y2] = match;
    const displayText = text || contentDesc;
    if (!displayText) continue;
    const cx = Math.round((parseInt(x1) + parseInt(x2)) / 2);
    const cy = Math.round((parseInt(y1) + parseInt(y2)) / 2);
    const shortClass = className.split('.').pop() || className;
    elements.push(`[${shortClass}] "${displayText}" @ (${cx}, ${cy})`);
  }

  if (elements.length === 0) {
    return 'המסך ריק או לא ניתן לפענח אלמנטים';
  }

  return `📱 אלמנטים על המסך (${elements.length}):\n${elements.join('\n')}`;
}

export async function uiGetCurrentApp(): Promise<string> {
  try {
    const result = await runCommand(
      'dumpsys activity activities 2>/dev/null | grep -E "mResumedActivity|topResumedActivity" | head -1',
      undefined, 5000
    );
    const match = result.match(/(\w+\/\.\w+)/);
    return match ? match[1] : result.trim() || 'לא ניתן לזהות את האפליקציה הנוכחית';
  } catch {
    return 'לא ניתן לזהות את האפליקציה הנוכחית';
  }
}

// ===== APP MANAGEMENT =====

export async function uiOpenApp(packageName: string): Promise<string> {
  try {
    await runCommand(
      `am start -n $(cmd package resolve-activity --brief ${packageName} | tail -1) 2>/dev/null || monkey -p ${packageName} -c android.intent.category.LAUNCHER 1 2>/dev/null`,
      undefined, 10000
    );
    // Wait for app to open
    await new Promise(resolve => setTimeout(resolve, 1500));
    return `פתחתי את ${packageName}`;
  } catch {
    return `לא הצלחתי לפתוח את ${packageName}`;
  }
}

export async function uiListApps(): Promise<string> {
  try {
    const result = await runCommand(
      'pm list packages -3 2>/dev/null | sed "s/package://" | sort',
      undefined, 10000
    );
    const packages = result.split('\n').filter(Boolean);
    return `📱 אפליקציות מותקנות (${packages.length}):\n${packages.join('\n')}`;
  } catch {
    return 'לא ניתן לרשום אפליקציות';
  }
}

// ===== SCREENSHOT =====

export async function uiScreenshot(): Promise<string> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Try multiple screenshot methods in order of reliability
  const methods = [
    { name: 'screencap', cmd: `screencap -p ${SCREENSHOT_PATH} 2>/dev/null` },
    { name: 'termux-screenshot', cmd: `termux-screenshot -f ${SCREENSHOT_PATH} 2>/dev/null` },
    { name: 'su-screencap', cmd: `su -c "screencap -p ${SCREENSHOT_PATH}" 2>/dev/null` },
  ];

  for (const method of methods) {
    try {
      // Remove old screenshot first
      try { fs.unlinkSync(SCREENSHOT_PATH); } catch {}
      await runCommand(method.cmd, undefined, 10000);
      if (fs.existsSync(SCREENSHOT_PATH)) {
        const stat = fs.statSync(SCREENSHOT_PATH);
        if (stat.size > 1000) { // Valid PNG is at least 1KB
          const base64 = fs.readFileSync(SCREENSHOT_PATH).toString('base64');
          console.log(`[Screenshot] Success via ${method.name} (${Math.round(stat.size / 1024)}KB)`);
          return `screenshot:${base64}`;
        }
      }
    } catch {
      // Try next method
    }
  }

  return 'לא הצלחתי לצלם מסך — נדרשת הרשאת PROJECTION_MEDIA או root.\n' +
    'טיפ: הפעל את Termux:API ותן הרשאת צילום מסך, או התקן עם:\n' +
    'pkg install termux-api && termux-setup-storage';
}

// ===== APP RECIPES =====

const APP_PACKAGES: Record<string, string> = {
  whatsapp: 'com.whatsapp',
  telegram: 'org.telegram.messenger',
  waze: 'com.waze',
  maps: 'com.google.android.apps.maps',
  chrome: 'com.android.chrome',
  gmail: 'com.google.android.gm',
  phone: 'com.google.android.dialer',
  camera: 'com.android.camera',
  settings: 'com.android.settings',
  youtube: 'com.google.android.youtube',
  spotify: 'com.spotify.music',
  wolt: 'com.wolt.android',
  gett: 'com.gettaxi.android',
  instagram: 'com.instagram.android',
  facebook: 'com.facebook.katana',
  calculator: 'com.google.android.calculator',
  clock: 'com.google.android.deskclock',
  calendar: 'com.google.android.calendar',
  files: 'com.google.android.documentsui',
  gallery: 'com.google.android.apps.photos',
};

export function resolveAppPackage(appName: string): string | null {
  const lower = appName.toLowerCase().trim();
  return APP_PACKAGES[lower] || null;
}

export async function uiOpenNamedApp(appName: string): Promise<string> {
  const pkg = resolveAppPackage(appName);
  if (pkg) {
    return uiOpenApp(pkg);
  }
  // Try fuzzy match
  const entries = Object.entries(APP_PACKAGES);
  const fuzzy = entries.find(([key]) => key.includes(appName.toLowerCase()) || appName.toLowerCase().includes(key));
  if (fuzzy) {
    return uiOpenApp(fuzzy[1]);
  }
  return `לא מכיר את האפליקציה "${appName}". אפליקציות ידועות: ${Object.keys(APP_PACKAGES).join(', ')}`;
}

// ===== COMPOSITE ACTIONS =====

export async function uiWaitForText(text: string, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dump = await uiDumpScreen();
    if (dump.includes(text)) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

export async function uiOpenAndType(appName: string, text: string): Promise<string> {
  const openResult = await uiOpenNamedApp(appName);
  if (openResult.includes('לא')) return openResult;
  await new Promise(resolve => setTimeout(resolve, 2000));
  await uiType(text);
  return `${openResult}\nTyped: "${text}"`;
}

// ===== UTILITY =====

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
