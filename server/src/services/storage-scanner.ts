import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = '/storage/emulated/0';
const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const SCAN_RESULT_FILE = path.join(DATA_DIR, 'last-scan.json');

// Known junk patterns
const JUNK_PATTERNS = [
  '.thumbnails', '.cache', 'cache', 'Cache',
  '.trash', 'Trash', '.Trash',
  '.tmp', 'tmp', 'temp', 'Temp',
  'log', 'logs', '.log',
];

const JUNK_EXTENSIONS = [
  '.tmp', '.temp', '.log', '.bak', '.old',
  '.part', '.crdownload', '.download',
];

export interface ScanResult {
  timestamp: string;
  totalFiles: number;
  totalSizeMb: number;
  freeSpaceMb: number;
  duplicates: DuplicateGroup[];
  largeFiles: FileInfo[];
  junkFiles: FileInfo[];
  cacheFiles: FileInfo[];
  emptyFolders: string[];
  totalSavingsMb: number;
}

export interface FileInfo {
  path: string;
  name: string;
  sizeMb: number;
  modified: string;
  category: string;
}

export interface DuplicateGroup {
  hash: string;
  sizeMb: number;
  files: string[];
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function getFileSizeMb(filePath: string): number {
  try {
    return fs.statSync(filePath).size / (1024 * 1024);
  } catch { return 0; }
}

function getFileModified(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch { return ''; }
}

function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch { return ''; }
}

function categorizeFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic'];
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.3gp', '.webm'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
  const apkExts = ['.apk', '.xapk', '.apks'];

  if (imageExts.includes(ext)) return 'תמונות';
  if (videoExts.includes(ext)) return 'סרטונים';
  if (audioExts.includes(ext)) return 'אודיו';
  if (docExts.includes(ext)) return 'מסמכים';
  if (apkExts.includes(ext)) return 'APK';
  if (ext === '.zip' || ext === '.rar' || ext === '.7z') return 'ארכיונים';
  return 'אחר';
}

export class StorageScanner {
  private scanning = false;
  private lastResult: ScanResult | null = null;

  constructor() {
    this.loadLastResult();
  }

  private loadLastResult(): void {
    try {
      if (fs.existsSync(SCAN_RESULT_FILE)) {
        this.lastResult = JSON.parse(fs.readFileSync(SCAN_RESULT_FILE, 'utf-8'));
      }
    } catch {}
  }

  private saveResult(result: ScanResult): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SCAN_RESULT_FILE, JSON.stringify(result, null, 2), 'utf-8');
    } catch {}
  }

  isScanning(): boolean { return this.scanning; }
  getLastResult(): ScanResult | null { return this.lastResult; }

  async scan(): Promise<ScanResult> {
    if (this.scanning) {
      throw new Error('Scan already in progress');
    }

    this.scanning = true;
    console.log('[Scanner] Starting deep storage scan...');

    try {
      const result = await this.performScan();
      this.lastResult = result;
      this.saveResult(result);
      console.log(`[Scanner] Complete: ${result.totalFiles} files, ${result.totalSavingsMb.toFixed(1)}MB potential savings`);
      return result;
    } finally {
      this.scanning = false;
    }
  }

  private async performScan(): Promise<ScanResult> {
    // Get free space
    const freeSpaceMb = safe(() => {
      const raw = execSync(`df ${STORAGE_ROOT} 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
      const parts = raw.trim().split(/\s+/);
      return Math.round(parseInt(parts[3] || '0') / 1024); // KB to MB
    }, -1);

    // Find all files with size > 0
    const allFiles = safe(() => {
      const raw = execSync(
        `find ${STORAGE_ROOT} -type f -not -path '*/\\.*' -not -path '*/node_modules/*' -printf '%s\\t%p\\n' 2>/dev/null | head -10000`,
        { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
      ).toString();
      return raw.split('\n').filter(Boolean).map(line => {
        const [size, ...pathParts] = line.split('\t');
        return { path: pathParts.join('\t'), size: parseInt(size || '0') };
      });
    }, []);

    const totalFiles = allFiles.length;
    const totalSizeMb = Math.round(allFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024));

    // === LARGE FILES (>50MB) ===
    const largeFiles: FileInfo[] = allFiles
      .filter(f => f.size > 50 * 1024 * 1024)
      .sort((a, b) => b.size - a.size)
      .slice(0, 20)
      .map(f => ({
        path: f.path,
        name: path.basename(f.path),
        sizeMb: Math.round(f.size / (1024 * 1024) * 10) / 10,
        modified: getFileModified(f.path),
        category: categorizeFile(f.path),
      }));

    // === JUNK FILES ===
    const junkFiles: FileInfo[] = allFiles
      .filter(f => {
        const name = path.basename(f.path).toLowerCase();
        const ext = path.extname(f.path).toLowerCase();
        const dir = path.dirname(f.path).toLowerCase();
        return JUNK_EXTENSIONS.includes(ext) ||
               JUNK_PATTERNS.some(p => dir.includes(p.toLowerCase()) || name.includes(p.toLowerCase()));
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, 30)
      .map(f => ({
        path: f.path,
        name: path.basename(f.path),
        sizeMb: Math.round(f.size / (1024 * 1024) * 10) / 10,
        modified: getFileModified(f.path),
        category: 'זבל',
      }));

    // === CACHE FILES ===
    const cacheFiles: FileInfo[] = safe(() => {
      const raw = execSync(
        `find ${STORAGE_ROOT} -type f \\( -path '*cache*' -o -path '*Cache*' -o -path '*.thumbnails*' \\) -printf '%s\\t%p\\n' 2>/dev/null | sort -rn | head -30`,
        { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
      ).toString();
      return raw.split('\n').filter(Boolean).map(line => {
        const [size, ...pp] = line.split('\t');
        const filePath = pp.join('\t');
        return {
          path: filePath,
          name: path.basename(filePath),
          sizeMb: Math.round(parseInt(size || '0') / (1024 * 1024) * 10) / 10,
          modified: '',
          category: 'cache',
        };
      });
    }, []);

    // === DUPLICATES (by size first, then hash) ===
    const duplicates: DuplicateGroup[] = [];
    const sizeGroups = new Map<number, string[]>();
    for (const f of allFiles) {
      if (f.size > 100 * 1024) { // Only check files > 100KB
        const key = f.size;
        if (!sizeGroups.has(key)) sizeGroups.set(key, []);
        sizeGroups.get(key)!.push(f.path);
      }
    }

    // Hash only groups with same size (potential duplicates)
    for (const [size, paths] of sizeGroups) {
      if (paths.length < 2 || paths.length > 10) continue; // Skip too many (probably not duplicates)
      const hashGroups = new Map<string, string[]>();
      for (const p of paths) {
        const h = hashFile(p);
        if (!h) continue;
        if (!hashGroups.has(h)) hashGroups.set(h, []);
        hashGroups.get(h)!.push(p);
      }
      for (const [hash, files] of hashGroups) {
        if (files.length >= 2) {
          duplicates.push({
            hash,
            sizeMb: Math.round(size / (1024 * 1024) * 10) / 10,
            files,
          });
        }
      }
      if (duplicates.length >= 20) break; // Limit
    }

    // === EMPTY FOLDERS ===
    const emptyFolders: string[] = safe(() => {
      const raw = execSync(
        `find ${STORAGE_ROOT} -type d -empty -not -path '*/\\.*' 2>/dev/null | head -20`,
        { timeout: 10000 }
      ).toString();
      return raw.split('\n').filter(Boolean);
    }, []);

    // Calculate total potential savings
    const junkSizeMb = junkFiles.reduce((s, f) => s + f.sizeMb, 0);
    const cacheSizeMb = cacheFiles.reduce((s, f) => s + f.sizeMb, 0);
    const dupSizeMb = duplicates.reduce((s, d) => s + d.sizeMb * (d.files.length - 1), 0);
    const totalSavingsMb = Math.round((junkSizeMb + cacheSizeMb + dupSizeMb) * 10) / 10;

    return {
      timestamp: new Date().toISOString(),
      totalFiles,
      totalSizeMb,
      freeSpaceMb,
      duplicates,
      largeFiles,
      junkFiles,
      cacheFiles,
      emptyFolders,
      totalSavingsMb,
    };
  }

  // === CLEANUP ACTIONS ===

  deleteFiles(filePaths: string[]): { deleted: number; errors: string[] } {
    let deleted = 0;
    const errors: string[] = [];
    for (const p of filePaths) {
      // Safety: only delete within storage
      if (!p.startsWith(STORAGE_ROOT) && !p.startsWith(process.env.HOME || '/data')) {
        errors.push(`Refused: ${p} (outside storage)`);
        continue;
      }
      try {
        fs.unlinkSync(p);
        deleted++;
      } catch (err) {
        errors.push(`${path.basename(p)}: ${(err as Error).message}`);
      }
    }
    return { deleted, errors };
  }

  clearCache(): { freedMb: number } {
    let freedBytes = 0;
    const cacheDirs = safe(() => {
      return execSync(
        `find ${STORAGE_ROOT} -type d \\( -name 'cache' -o -name 'Cache' -o -name '.thumbnails' \\) 2>/dev/null`,
        { timeout: 10000 }
      ).toString().split('\n').filter(Boolean);
    }, []);

    for (const dir of cacheDirs) {
      try {
        const raw = execSync(`du -sb "${dir}" 2>/dev/null`).toString();
        freedBytes += parseInt(raw.split('\t')[0] || '0');
        execSync(`rm -rf "${dir}"/* 2>/dev/null`, { timeout: 10000 });
      } catch {}
    }

    return { freedMb: Math.round(freedBytes / (1024 * 1024) * 10) / 10 };
  }

  deleteEmptyFolders(): number {
    let count = 0;
    const folders = safe(() => {
      return execSync(
        `find ${STORAGE_ROOT} -type d -empty -not -path '*/\\.*' 2>/dev/null`,
        { timeout: 10000 }
      ).toString().split('\n').filter(Boolean);
    }, []);

    for (const dir of folders) {
      try {
        fs.rmdirSync(dir);
        count++;
      } catch {}
    }
    return count;
  }
}
