import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const BACKUP_DIR = path.join(process.env.HOME || '.', '.ai-agent', 'backups');
const STORAGE_BACKUP = '/storage/emulated/0/AI-Agent-Backups';

const DATA_FILES = [
  'reminders.json',
  'routines.json',
  'memory.json',
  'user-profile.json',
  'smart-alerts.json',
  'snapshots.json',
  'suggestions.json',
  'proactive-state.json',
];

const DATA_DIRS = [
  'conversations',
];

export interface BackupInfo {
  id: string;
  timestamp: string;
  size: number;
  fileCount: number;
  path: string;
}

export class BackupService {
  constructor() {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    for (const dir of [BACKUP_DIR, STORAGE_BACKUP]) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    const externalPath = path.join(STORAGE_BACKUP, `${backupName}.tar.gz`);

    try {
      fs.mkdirSync(backupPath, { recursive: true });

      let fileCount = 0;
      let totalSize = 0;

      // Copy data files
      for (const file of DATA_FILES) {
        const src = path.join(DATA_DIR, file);
        if (fs.existsSync(src)) {
          const content = fs.readFileSync(src);
          fs.writeFileSync(path.join(backupPath, file), content);
          fileCount++;
          totalSize += content.length;
        }
      }

      // Copy data directories
      for (const dir of DATA_DIRS) {
        const srcDir = path.join(DATA_DIR, dir);
        if (fs.existsSync(srcDir)) {
          const destDir = path.join(backupPath, dir);
          fs.mkdirSync(destDir, { recursive: true });
          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            const content = fs.readFileSync(path.join(srcDir, file));
            fs.writeFileSync(path.join(destDir, file), content);
            fileCount++;
            totalSize += content.length;
          }
        }
      }

      // Create compressed archive for external storage
      try {
        execSync(`tar -czf "${externalPath}" -C "${BACKUP_DIR}" "${backupName}" 2>/dev/null`, { timeout: 30000 });
      } catch {
        // tar might not be available, copy folder instead
        try {
          execSync(`cp -r "${backupPath}" "${STORAGE_BACKUP}/${backupName}" 2>/dev/null`, { timeout: 10000 });
        } catch {}
      }

      const sizeMb = (totalSize / (1024 * 1024)).toFixed(2);

      return [
        `✅ גיבוי נוצר בהצלחה!`,
        `📦 ${fileCount} קבצים (${sizeMb} MB)`,
        `📂 מיקום פנימי: ${backupPath}`,
        `💾 מיקום חיצוני: ${externalPath}`,
        `🕐 ${new Date().toLocaleString('he-IL')}`,
      ].join('\n');
    } catch (err) {
      return `❌ שגיאה ביצירת גיבוי: ${(err as Error).message}`;
    }
  }

  async restoreBackup(backupId?: string): Promise<string> {
    try {
      // Find latest backup if no ID specified
      let backupPath: string;

      if (backupId) {
        backupPath = path.join(BACKUP_DIR, backupId);
        if (!fs.existsSync(backupPath)) {
          return `❌ גיבוי "${backupId}" לא נמצא`;
        }
      } else {
        const backups = this.listBackups();
        if (backups.length === 0) return '❌ אין גיבויים זמינים';
        backupPath = backups[0].path;
      }

      let restoredCount = 0;

      // Restore data files
      for (const file of DATA_FILES) {
        const src = path.join(backupPath, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(DATA_DIR, file));
          restoredCount++;
        }
      }

      // Restore directories
      for (const dir of DATA_DIRS) {
        const srcDir = path.join(backupPath, dir);
        if (fs.existsSync(srcDir)) {
          const destDir = path.join(DATA_DIR, dir);
          fs.mkdirSync(destDir, { recursive: true });
          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            restoredCount++;
          }
        }
      }

      return [
        `✅ שוחזר בהצלחה!`,
        `📦 ${restoredCount} קבצים שוחזרו`,
        `📂 מקור: ${backupPath}`,
        `⚠️ יש להפעיל מחדש את השרת כדי שהשינויים ייכנסו לתוקף.`,
      ].join('\n');
    } catch (err) {
      return `❌ שגיאה בשחזור: ${(err as Error).message}`;
    }
  }

  listBackups(): BackupInfo[] {
    const backups: BackupInfo[] = [];

    try {
      if (!fs.existsSync(BACKUP_DIR)) return [];
      const entries = fs.readdirSync(BACKUP_DIR)
        .filter(e => e.startsWith('backup-'))
        .sort()
        .reverse();

      for (const entry of entries) {
        const fullPath = path.join(BACKUP_DIR, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const files = this.countFiles(fullPath);
          backups.push({
            id: entry,
            timestamp: entry.replace('backup-', '').replace(/T/g, ' ').replace(/-/g, ':').slice(0, 19),
            size: this.dirSize(fullPath),
            fileCount: files,
            path: fullPath,
          });
        }
      }
    } catch {}

    return backups;
  }

  private countFiles(dir: string): number {
    let count = 0;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) count += this.countFiles(full);
        else count++;
      }
    } catch {}
    return count;
  }

  private dirSize(dir: string): number {
    let size = 0;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) size += this.dirSize(full);
        else size += stat.size;
      }
    } catch {}
    return size;
  }
}
