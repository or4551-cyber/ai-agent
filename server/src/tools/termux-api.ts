import { runCommand } from './terminal';
import * as fs from 'fs/promises';
import * as path from 'path';

// ===== GALLERY =====

export async function galleryList(
  directory?: string,
  sortBy = 'date',
  limit = 50
): Promise<string> {
  const dir = directory || '/storage/emulated/0/DCIM/Camera';
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: { name: string; path: string; size: number; modified: Date }[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.webp', '.heic'].includes(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          size: stat.size,
          modified: stat.mtime,
        });
      } catch {
        continue;
      }
    }

    // Sort
    if (sortBy === 'date') files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    else if (sortBy === 'name') files.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') files.sort((a, b) => b.size - a.size);

    const result = files.slice(0, limit).map((f) => {
      const size = f.size < 1024 * 1024
        ? `${(f.size / 1024).toFixed(0)}KB`
        : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
      return `${f.name} | ${f.modified.toISOString().split('T')[0]} | ${size}`;
    });

    return `Found ${files.length} media files in ${dir}:\n${result.join('\n')}`;
  } catch (err) {
    return `Error listing gallery: ${(err as Error).message}`;
  }
}

export async function galleryOrganize(
  sourceDir: string,
  targetDir: string,
  organizeBy: string
): Promise<string> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.webp', '.heic'].includes(ext)) continue;

    const fullPath = path.join(sourceDir, entry.name);
    const stat = await fs.stat(fullPath);
    let folderName: string;

    if (organizeBy === 'month') {
      const d = stat.mtime;
      folderName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else if (organizeBy === 'year') {
      folderName = `${stat.mtime.getFullYear()}`;
    } else if (organizeBy === 'type') {
      folderName = ['.mp4', '.mov'].includes(ext) ? 'Videos' : 'Photos';
    } else {
      folderName = 'Unsorted';
    }

    const destDir = path.join(targetDir, folderName);
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(fullPath, path.join(destDir, entry.name));
    moved++;
  }

  return `Organized ${moved} files from ${sourceDir} into ${targetDir} by ${organizeBy}`;
}

// ===== SMS =====

export async function sendSms(number: string, message: string): Promise<string> {
  return runCommand(`termux-sms-send -n "${number}" "${message}"`);
}

// ===== CONTACTS =====

export async function getContacts(search?: string): Promise<string> {
  const raw = await runCommand('termux-contact-list');
  try {
    const contacts = JSON.parse(raw);
    if (search) {
      const filtered = contacts.filter(
        (c: { name: string }) => c.name.toLowerCase().includes(search.toLowerCase())
      );
      return JSON.stringify(filtered, null, 2);
    }
    return JSON.stringify(contacts.slice(0, 50), null, 2);
  } catch {
    return raw;
  }
}

// ===== LOCATION =====

export async function getLocation(): Promise<string> {
  const raw = await runCommand('termux-location -p network', undefined, 15000);
  try {
    const loc = JSON.parse(raw);
    return `Latitude: ${loc.latitude}, Longitude: ${loc.longitude}, Accuracy: ${loc.accuracy}m`;
  } catch {
    return raw;
  }
}

// ===== CAMERA =====

export async function takePhoto(cameraId = 0, savePath?: string): Promise<string> {
  const outputPath = savePath || `/storage/emulated/0/DCIM/ai-photo-${Date.now()}.jpg`;
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  
  await runCommand(`termux-camera-photo -c ${cameraId} "${outputPath}"`, undefined, 15000);
  
  // Verify photo was actually created
  try {
    const stat = await fs.stat(outputPath);
    if (stat.size < 100) {
      return `Error: Photo file created but seems empty (${stat.size} bytes). Camera may not have permissions. Try: termux-setup-storage`;
    }
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    return `Photo saved to: ${outputPath} (${sizeMB}MB). The user can view it in the Gallery tab.`;
  } catch {
    return `Error: Photo was not saved. Make sure Termux:API is installed and camera permissions are granted. Run: termux-setup-storage`;
  }
}

// ===== CLIPBOARD =====

export async function getClipboard(): Promise<string> {
  return runCommand('termux-clipboard-get');
}

// ===== BATTERY =====

export async function getBattery(): Promise<string> {
  const raw = await runCommand('termux-battery-status');
  try {
    const battery = JSON.parse(raw);
    return `Battery: ${battery.percentage}% | Status: ${battery.status} | Temperature: ${battery.temperature}°C`;
  } catch {
    return raw;
  }
}

// ===== NOTIFICATIONS =====

export async function getNotifications(): Promise<string> {
  const raw = await runCommand('termux-notification-list');
  try {
    const notifications = JSON.parse(raw);
    const summary = notifications.slice(0, 10).map(
      (n: { title: string; content: string; packageName: string }) =>
        `[${n.packageName}] ${n.title}: ${n.content}`
    );
    return summary.join('\n') || 'No notifications';
  } catch {
    return raw;
  }
}

// ===== APP LAUNCHER =====

const APP_ALIASES: Record<string, string> = {
  'whatsapp': 'com.whatsapp/.Main',
  'ווטסאפ': 'com.whatsapp/.Main',
  'chrome': 'com.android.chrome/com.google.android.apps.chrome.Main',
  'כרום': 'com.android.chrome/com.google.android.apps.chrome.Main',
  'youtube': 'com.google.android.youtube/.HomeActivity',
  'יוטיוב': 'com.google.android.youtube/.HomeActivity',
  'spotify': 'com.spotify.music/.MainActivity',
  'ספוטיפיי': 'com.spotify.music/.MainActivity',
  'telegram': 'org.telegram.messenger/.DefaultIcon',
  'טלגרם': 'org.telegram.messenger/.DefaultIcon',
  'instagram': 'com.instagram.android/.activity.MainTabActivity',
  'אינסטגרם': 'com.instagram.android/.activity.MainTabActivity',
  'camera': 'com.android.camera/.CameraActivity',
  'מצלמה': 'com.android.camera/.CameraActivity',
  'settings': 'com.android.settings/.Settings',
  'הגדרות': 'com.android.settings/.Settings',
  'maps': 'com.google.android.apps.maps/com.google.android.maps.MapsActivity',
  'מפות': 'com.google.android.apps.maps/com.google.android.maps.MapsActivity',
  'gmail': 'com.google.android.gm/.ConversationListActivityGmail',
  'ג\'ימייל': 'com.google.android.gm/.ConversationListActivityGmail',
  'phone': 'com.android.dialer/.DialtactsActivity',
  'טלפון': 'com.android.dialer/.DialtactsActivity',
  'calculator': 'com.android.calculator2/.Calculator',
  'מחשבון': 'com.android.calculator2/.Calculator',
  'clock': 'com.android.deskclock/.DeskClock',
  'שעון': 'com.android.deskclock/.DeskClock',
  'files': 'com.google.android.documentsui/.files.FilesActivity',
  'קבצים': 'com.google.android.documentsui/.files.FilesActivity',
  'gallery': 'com.google.android.apps.photos/.home.HomeActivity',
  'גלריה': 'com.google.android.apps.photos/.home.HomeActivity',
  'tiktok': 'com.zhiliaoapp.musically/.activity.MainActivityLaunch',
  'טיקטוק': 'com.zhiliaoapp.musically/.activity.MainActivityLaunch',
  'waze': 'com.waze/.FreeMapAppActivity',
  'וויז': 'com.waze/.FreeMapAppActivity',
};

export async function openApp(appName: string): Promise<string> {
  const key = appName.toLowerCase().trim();

  // Try alias first
  const alias = APP_ALIASES[key];
  if (alias) {
    try {
      await runCommand(`am start -n ${alias} 2>/dev/null`, undefined, 5000);
      return `פתחתי את ${appName}`;
    } catch {}
  }

  // Try as package name
  if (key.includes('.')) {
    try {
      await runCommand(`monkey -p ${key} -c android.intent.category.LAUNCHER 1 2>/dev/null`, undefined, 5000);
      return `פתחתי את ${key}`;
    } catch {}
  }

  // Search installed packages
  try {
    const raw = await runCommand(`pm list packages 2>/dev/null | grep -i "${key}" | head -5`, undefined, 5000);
    if (raw.trim()) {
      const firstPkg = raw.split('\n')[0].replace('package:', '').trim();
      await runCommand(`monkey -p ${firstPkg} -c android.intent.category.LAUNCHER 1 2>/dev/null`, undefined, 5000);
      return `פתחתי את ${firstPkg}`;
    }
  } catch {}

  return `לא מצאתי אפליקציה בשם "${appName}". נסה שם חבילה מדויק (למשל com.whatsapp).`;
}

export async function listApps(filter?: string): Promise<string> {
  try {
    const cmd = filter
      ? `pm list packages 2>/dev/null | grep -i "${filter}"`
      : 'pm list packages -3 2>/dev/null | head -40';
    const raw = await runCommand(cmd, undefined, 10000);
    const packages = raw.split('\n')
      .filter(Boolean)
      .map(line => line.replace('package:', '').trim());

    if (packages.length === 0) return filter ? `לא נמצאו אפליקציות עם "${filter}"` : 'לא נמצאו אפליקציות';
    return `אפליקציות מותקנות (${packages.length}):\n${packages.join('\n')}`;
  } catch (err) {
    return `שגיאה: ${(err as Error).message}`;
  }
}

// ===== CALENDAR =====

export async function calendarList(days = 1): Promise<string> {
  // Try termux-calendar-list first, fallback to content provider
  try {
    const raw = await runCommand('termux-calendar-list 2>/dev/null', undefined, 5000);
    const events = JSON.parse(raw);
    if (events.length === 0) return 'אין אירועים בלוח השנה.';

    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const filtered = events.filter((e: any) => {
      const start = new Date(e.dtstart || e.begin);
      return start >= now && start <= endDate;
    });

    if (filtered.length === 0) return `אין אירועים ב-${days} הימים הקרובים.`;

    return filtered.map((e: any) => {
      const start = new Date(e.dtstart || e.begin);
      const time = start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const date = start.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
      return `📅 ${date} ${time} — ${e.title || e.eventTitle || 'ללא כותרת'}${e.eventLocation ? ` (${e.eventLocation})` : ''}`;
    }).join('\n');
  } catch {
    // Fallback: content provider query
    try {
      const raw = await runCommand(
        `content query --uri content://com.android.calendar/events --projection title:dtstart:dtend:eventLocation 2>/dev/null | head -20`,
        undefined, 10000
      );
      if (!raw.trim()) return 'לא הצלחתי לגשת ללוח השנה. וודא ש-Termux:API מותקן עם הרשאת calendar.';
      return raw;
    } catch {
      return 'לא הצלחתי לקרוא את לוח השנה. וודא ש-termux-api מותקן וניתנו הרשאות.';
    }
  }
}

export async function calendarAdd(title: string, startTime: string, endTime?: string, location?: string): Promise<string> {
  try {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour

    const startMs = start.getTime();
    const endMs = end.getTime();

    // Use content provider to insert event
    let cmd = `content insert --uri content://com.android.calendar/events`;
    cmd += ` --bind title:s:"${title}"`;
    cmd += ` --bind dtstart:l:${startMs}`;
    cmd += ` --bind dtend:l:${endMs}`;
    cmd += ` --bind calendar_id:i:1`;
    cmd += ` --bind eventTimezone:s:Asia/Jerusalem`;
    if (location) cmd += ` --bind eventLocation:s:"${location}"`;
    cmd += ` 2>/dev/null`;

    await runCommand(cmd, undefined, 5000);

    const dateStr = start.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    return `📅 אירוע נוצר: "${title}" ב-${dateStr} ${timeStr}${location ? ` ב${location}` : ''}`;
  } catch (err) {
    return `שגיאה ביצירת אירוע: ${(err as Error).message}`;
  }
}

// ===== WHATSAPP =====

export async function whatsappMessages(): Promise<string> {
  try {
    const raw = await runCommand('termux-notification-list 2>/dev/null', undefined, 5000);
    const notifications = JSON.parse(raw);

    const waMessages = notifications.filter(
      (n: any) => n.packageName === 'com.whatsapp' || n.packageName === 'com.whatsapp.w4b'
    );

    if (waMessages.length === 0) return 'אין הודעות ווטסאפ חדשות.';

    return `הודעות ווטסאפ (${waMessages.length}):\n` + waMessages.map((n: any) => {
      return `💬 ${n.title || 'Unknown'}: ${n.content || n.text || '(ריק)'}`;
    }).join('\n');
  } catch (err) {
    return `שגיאה בקריאת הודעות: ${(err as Error).message}`;
  }
}

export async function whatsappReply(contactName: string, message: string): Promise<string> {
  try {
    const raw = await runCommand('termux-notification-list 2>/dev/null', undefined, 5000);
    const notifications = JSON.parse(raw);

    const waNotif = notifications.find(
      (n: any) =>
        (n.packageName === 'com.whatsapp' || n.packageName === 'com.whatsapp.w4b') &&
        n.title && n.title.toLowerCase().includes(contactName.toLowerCase())
    );

    if (!waNotif) {
      return `לא מצאתי הודעה מ-"${contactName}" בהתראות. ייתכן שההודעה כבר נקראה.`;
    }

    // Try notification reply
    if (waNotif.key) {
      await runCommand(
        `termux-notification-reply -k "${waNotif.key}" "${message.replace(/"/g, '\\"')}" 2>/dev/null`,
        undefined, 5000
      );
      return `✅ שלחתי ל-${contactName}: "${message}"`;
    }

    return 'לא הצלחתי לשלוח תשובה — ההתראה לא תומכת ב-reply.';
  } catch (err) {
    return `שגיאה: ${(err as Error).message}`;
  }
}
