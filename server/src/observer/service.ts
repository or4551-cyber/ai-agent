import fs from 'fs';
import path from 'path';
import { takeSnapshot, DeviceSnapshot } from './snapshot';
import { analyzePatterns, AnalysisResult } from './analyzer';
import { generateDigest, Suggestion } from './digest';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.json');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');
const LAST_DIGEST_FILE = path.join(DATA_DIR, 'last-digest.txt');

const SNAPSHOT_INTERVAL = 5 * 60 * 1000;  // 5 minutes
const DIGEST_HOUR = 21; // 9 PM — daily digest
const MAX_SNAPSHOTS = 576; // 48 hours of 5-min intervals (more data = better insights)

export class ObserverService {
  private snapshotTimer: NodeJS.Timeout | null = null;
  private digestTimer: NodeJS.Timeout | null = null;
  private snapshots: DeviceSnapshot[] = [];
  private suggestions: Suggestion[] = [];
  private apiKey: string;
  private running = false;
  private totalCollected = 0;
  private consecutiveErrors = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ensureDir();
    this.loadState();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadState(): void {
    try {
      if (fs.existsSync(SNAPSHOTS_FILE)) {
        this.snapshots = JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, 'utf-8'));
      }
    } catch { this.snapshots = []; }

    try {
      if (fs.existsSync(SUGGESTIONS_FILE)) {
        this.suggestions = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf-8'));
      }
    } catch { this.suggestions = []; }
  }

  private saveSnapshots(): void {
    try {
      fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(this.snapshots.slice(-MAX_SNAPSHOTS)), 'utf-8');
    } catch (err) {
      console.error('[Observer] Save error:', (err as Error).message);
    }
  }

  private saveSuggestions(): void {
    try {
      fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(this.suggestions, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Observer] Save suggestions error:', (err as Error).message);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    console.log('[Observer] Starting background observer (every 5 min)');

    // Take first snapshot
    this.collectSnapshot();

    // Schedule periodic snapshots
    this.snapshotTimer = setInterval(() => {
      this.collectSnapshot();
    }, SNAPSHOT_INTERVAL);

    // Check for digest time every hour
    this.digestTimer = setInterval(() => {
      this.checkDigestTime();
    }, 60 * 60 * 1000);

    // Also check now in case it's digest time
    this.checkDigestTime();
  }

  stop(): void {
    this.running = false;
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.digestTimer) clearInterval(this.digestTimer);
    console.log('[Observer] Stopped');
  }

  private collectSnapshot(): void {
    try {
      const snapshot = takeSnapshot();
      this.snapshots.push(snapshot);
      this.totalCollected++;
      this.consecutiveErrors = 0;

      // Rolling window — keep last 48h
      if (this.snapshots.length > MAX_SNAPSHOTS) {
        this.snapshots = this.snapshots.slice(-MAX_SNAPSHOTS);
      }

      this.saveSnapshots();

      // Log every 12th snapshot (~1 hour) to avoid spam
      if (this.totalCollected % 12 === 0 || this.totalCollected <= 3) {
        console.log(`[Observer] Snapshot #${this.totalCollected} (buffer: ${this.snapshots.length}/${MAX_SNAPSHOTS})`);
      }
    } catch (err) {
      this.consecutiveErrors++;
      console.error(`[Observer] Snapshot error (${this.consecutiveErrors}x): ${(err as Error).message}`);

      // Self-heal: if we fail 5 times in a row, restart the timer
      if (this.consecutiveErrors >= 5) {
        console.log('[Observer] Too many errors, restarting collection...');
        this.consecutiveErrors = 0;
        if (this.snapshotTimer) clearInterval(this.snapshotTimer);
        this.snapshotTimer = setInterval(() => this.collectSnapshot(), SNAPSHOT_INTERVAL);
      }
    }
  }

  private async checkDigestTime(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();

    if (hour !== DIGEST_HOUR) return;

    // Check if we already ran today
    const today = now.toISOString().split('T')[0];
    try {
      if (fs.existsSync(LAST_DIGEST_FILE)) {
        const lastDate = fs.readFileSync(LAST_DIGEST_FILE, 'utf-8').trim();
        if (lastDate === today) return; // Already ran today
      }
    } catch {}

    console.log('[Observer] Running daily digest...');
    await this.runDigest();

    // Mark as done today
    fs.writeFileSync(LAST_DIGEST_FILE, today, 'utf-8');
  }

  async runDigest(): Promise<Suggestion[]> {
    if (this.snapshots.length < 3) {
      console.log('[Observer] Not enough snapshots for digest');
      return [];
    }

    const analysis = this.getAnalysis();
    const suggestions = await generateDigest(analysis, this.apiKey);
    this.suggestions = suggestions;
    this.saveSuggestions();

    // Send notification via Termux
    if (suggestions.length > 0) {
      try {
        const { execSync } = require('child_process');
        const title = 'AI Agent — המלצות יומיות';
        const content = suggestions.map(s => `${s.emoji} ${s.title}`).join('\n');
        execSync(
          `termux-notification --title "${title}" --content "${content.replace(/"/g, '\\"')}" --id ai-digest 2>/dev/null`,
          { timeout: 5000 }
        );
      } catch {}
    }

    console.log(`[Observer] Digest complete: ${suggestions.length} suggestions`);
    return suggestions;
  }

  getAnalysis(): AnalysisResult {
    return analyzePatterns(this.snapshots);
  }

  getSuggestions(): Suggestion[] {
    return this.suggestions;
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  getStatus(): Record<string, unknown> {
    const lastTs = this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1].timestamp : null;
    const lastAge = lastTs ? Math.round((Date.now() - new Date(lastTs).getTime()) / 60000) : null;
    return {
      running: this.running,
      snapshotCount: this.snapshots.length,
      totalCollected: this.totalCollected,
      bufferMax: MAX_SNAPSHOTS,
      suggestionsCount: this.suggestions.length,
      lastSnapshot: lastTs,
      lastSnapshotAge: lastAge !== null ? `${lastAge} דקות` : null,
      consecutiveErrors: this.consecutiveErrors,
      interval: '5 min',
      digestHour: `${DIGEST_HOUR}:00`,
    };
  }
}
