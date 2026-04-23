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
