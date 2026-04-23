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

// ===== SMART BRIEFING =====

export async function smartBriefing(): Promise<string> {
  const sections: string[] = [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'בוקר טוב! ☀️' : hour < 17 ? 'צהריים טובים! 🌤️' : hour < 21 ? 'ערב טוב! 🌆' : 'לילה טוב! 🌙';
  sections.push(greeting);
  sections.push(`📅 ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
  sections.push('---');

  // Battery
  try {
    const raw = await runCommand('termux-battery-status 2>/dev/null', undefined, 5000);
    const b = JSON.parse(raw);
    const icon = b.status === 'CHARGING' ? '🔌' : b.percentage > 50 ? '🔋' : '🪫';
    sections.push(`${icon} סוללה: ${b.percentage}%${b.status === 'CHARGING' ? ' (טוען)' : ''}`);
  } catch { sections.push('🔋 סוללה: לא זמין'); }

  // Calendar
  try {
    const cal = await calendarList(1);
    sections.push(`\n📆 יומן היום:\n${cal}`);
  } catch { sections.push('📆 יומן: לא זמין'); }

  // WhatsApp
  try {
    const wa = await whatsappMessages();
    sections.push(`\n${wa}`);
  } catch { sections.push('💬 ווטסאפ: לא זמין'); }

  // Storage
  try {
    const raw = await runCommand('df -h /storage/emulated/0 2>/dev/null | tail -1', undefined, 3000);
    if (raw.trim()) {
      sections.push(`\n💾 אחסון: ${raw.trim().split(/\s+/).slice(1, 4).join(' | ')}`);
    }
  } catch {}

  return sections.join('\n');
}

// ===== QR CODE SCANNER =====

export async function scanQrCode(imagePath?: string): Promise<string> {
  try {
    let photoPath = imagePath;

    // Take photo if no image provided
    if (!photoPath) {
      photoPath = `/data/data/com.termux/files/home/.ai-agent/qr-scan-${Date.now()}.jpg`;
      await runCommand(`termux-camera-photo -c 0 "${photoPath}"`, undefined, 10000);
      // Verify
      try {
        const stat = await fs.stat(photoPath);
        if (stat.size < 100) return 'לא הצלחתי לצלם. וודא שיש הרשאת מצלמה.';
      } catch {
        return 'לא הצלחתי לצלם. וודא ש-Termux:API מותקן.';
      }
    }

    // Try zbarimg first (fast, reliable)
    try {
      const result = await runCommand(`zbarimg -q "${photoPath}" 2>/dev/null`, undefined, 5000);
      if (result.trim()) {
        const decoded = result.trim().split('\n').map(line => {
          const [type, ...data] = line.split(':');
          return `${type}: ${data.join(':')}`;
        });
        // Cleanup temp photo
        if (!imagePath) await fs.unlink(photoPath).catch(() => {});
        return `📱 QR Code נסרק!\n${decoded.join('\n')}`;
      }
    } catch {}

    // Fallback: Python with pyzbar/PIL
    try {
      const pyScript = `
import sys
try:
    from pyzbar.pyzbar import decode
    from PIL import Image
    img = Image.open("${photoPath}")
    results = decode(img)
    if results:
        for r in results:
            print(f"{r.type}: {r.data.decode()}")
    else:
        print("NO_QR_FOUND")
except ImportError:
    print("MISSING_DEPS")
`;
      const result = await runCommand(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`, undefined, 10000);
      if (result.includes('MISSING_DEPS')) {
        // Last resort: try termux-camera-barcode if available
        const barcodeResult = await runCommand('termux-barcode-scan 2>/dev/null', undefined, 15000);
        if (barcodeResult.trim()) return `📱 ברקוד נסרק!\n${barcodeResult.trim()}`;
        return 'לא מותקנים כלי סריקת QR. התקן: pip install pyzbar Pillow או pkg install zbar';
      }
      if (result.includes('NO_QR_FOUND')) return 'לא נמצא QR code בתמונה.';
      if (!imagePath) await fs.unlink(photoPath).catch(() => {});
      return `📱 QR Code נסרק!\n${result.trim()}`;
    } catch {}

    return 'לא הצלחתי לסרוק QR. נסה להתקין zbar: pkg install zbar';
  } catch (err) {
    return `שגיאה: ${(err as Error).message}`;
  }
}

// ===== MEDIA CONTROL =====

export async function mediaControl(action: string): Promise<string> {
  const commands: Record<string, { cmd: string; response: string }> = {
    play: { cmd: 'termux-media-player play', response: '▶️ מנגן' },
    pause: { cmd: 'termux-media-player pause', response: '⏸️ מושהה' },
    stop: { cmd: 'termux-media-player stop', response: '⏹️ הופסק' },
    next: { cmd: 'input keyevent KEYCODE_MEDIA_NEXT', response: '⏭️ שיר הבא' },
    previous: { cmd: 'input keyevent KEYCODE_MEDIA_PREVIOUS', response: '⏮️ שיר קודם' },
    play_pause: { cmd: 'input keyevent KEYCODE_MEDIA_PLAY_PAUSE', response: '⏯️ play/pause' },
  };

  const entry = commands[action.toLowerCase()];
  if (!entry) return `פעולה לא מוכרת: "${action}". פעולות זמינות: ${Object.keys(commands).join(', ')}`;

  try {
    await runCommand(entry.cmd, undefined, 3000);
    return entry.response;
  } catch (err) {
    return `שגיאה: ${(err as Error).message}`;
  }
}

export async function mediaVolume(level?: number, action?: string): Promise<string> {
  try {
    if (action === 'up') {
      await runCommand('input keyevent KEYCODE_VOLUME_UP', undefined, 2000);
      return '🔊 ווליום +';
    }
    if (action === 'down') {
      await runCommand('input keyevent KEYCODE_VOLUME_DOWN', undefined, 2000);
      return '🔉 ווליום -';
    }
    if (action === 'mute') {
      await runCommand('input keyevent KEYCODE_VOLUME_MUTE', undefined, 2000);
      return '🔇 מושתק';
    }
    if (level !== undefined) {
      const clamped = Math.max(0, Math.min(15, level));
      await runCommand(`termux-volume music ${clamped}`, undefined, 2000);
      return `🔊 ווליום הוגדר ל-${clamped}/15`;
    }
    // Get current volume
    const raw = await runCommand('termux-volume', undefined, 3000);
    try {
      const volumes = JSON.parse(raw);
      const music = volumes.find((v: any) => v.stream === 'music');
      return music ? `🔊 ווליום נוכחי: ${music.volume}/${music.max_volume}` : raw;
    } catch {
      return raw;
    }
  } catch (err) {
    return `שגיאה: ${(err as Error).message}`;
  }
}

export async function mediaNowPlaying(): Promise<string> {
  try {
    // Try to get info from termux-media-player
    const raw = await runCommand('termux-media-player info 2>/dev/null', undefined, 3000);
    if (raw.trim() && !raw.includes('No track')) {
      return `🎵 מנגן עכשיו:\n${raw.trim()}`;
    }

    // Fallback: check music-related notifications
    const notifRaw = await runCommand('termux-notification-list 2>/dev/null', undefined, 5000);
    const notifs = JSON.parse(notifRaw);
    const musicNotif = notifs.find((n: any) =>
      ['com.spotify.music', 'com.google.android.apps.youtube.music', 'com.google.android.music',
       'com.apple.android.music', 'deezer.android.app'].includes(n.packageName)
    );
    if (musicNotif) {
      return `🎵 ${musicNotif.title || ''} — ${musicNotif.content || musicNotif.text || ''}`;
    }
    return 'לא מנגן כלום כרגע.';
  } catch {
    return 'לא הצלחתי לקבל מידע על מה שמנגן.';
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
    // Step 1: Find the WhatsApp notification
    const raw = await runCommand('termux-notification-list 2>/dev/null', undefined, 8000);
    let notifications: any[];
    try {
      notifications = JSON.parse(raw);
    } catch {
      return '❌ לא הצלחתי לקרוא התראות. ודא שיש ל-Termux:API הרשאת Notification Access.';
    }

    const waNotifs = notifications.filter(
      (n: any) =>
        (n.packageName === 'com.whatsapp' || n.packageName === 'com.whatsapp.w4b') &&
        n.title && n.title.toLowerCase().includes(contactName.toLowerCase())
    );

    if (waNotifs.length === 0) {
      return `❌ לא מצאתי הודעה מ-"${contactName}" בהתראות. ייתכן שההודעה כבר נקראה או שההתראה נמחקה.`;
    }

    const waNotif = waNotifs[0];
    const escapedMsg = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    // Step 2: Try notification reply (primary method)
    if (waNotif.key) {
      try {
        const replyResult = await runCommand(
          `termux-notification-reply "${waNotif.key}" "${escapedMsg}"`,
          undefined, 8000
        );

        // Step 3: Verify — wait and check if the notification changed
        await new Promise(resolve => setTimeout(resolve, 2000));
        const verifyRaw = await runCommand('termux-notification-list 2>/dev/null', undefined, 8000);
        try {
          const verifyNotifs = JSON.parse(verifyRaw);
          const stillThere = verifyNotifs.find(
            (n: any) => n.key === waNotif.key &&
              n.content === waNotif.content
          );
          // If the notification content changed or disappeared, reply likely worked
          if (!stillThere) {
            return `✅ נשלח ל-${contactName}: "${message}"`;
          }
        } catch {}

        // Can't fully verify — be honest
        if (!replyResult || replyResult.trim() === '') {
          return `⚠️ ניסיתי לשלוח ל-${contactName}: "${message}"\nלא ניתן לאמת שההודעה נשלחה. בדוק בווטסאפ.`;
        }
      } catch (replyErr) {
        console.error('[WHATSAPP] notification-reply failed:', (replyErr as Error).message);
      }
    }

    // Step 4: Fallback — open WhatsApp with message pre-filled
    // Extract phone number if available from notification
    try {
      const encodedMsg = encodeURIComponent(message);
      await runCommand(
        `am start -a android.intent.action.VIEW -d "https://wa.me/?text=${encodedMsg}" com.whatsapp`,
        undefined, 5000
      );
      return `⚠️ לא הצלחתי לשלוח אוטומטית.\nפתחתי את ווטסאפ עם ההודעה מוכנה — לחץ שלח ל-${contactName}.`;
    } catch {}

    return `❌ לא הצלחתי לשלוח הודעה ל-${contactName}. נסה לשלוח ידנית דרך ווטסאפ.`;
  } catch (err) {
    return `❌ שגיאה בשליחת הודעה: ${(err as Error).message}`;
  }
}
