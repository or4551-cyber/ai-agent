/**
 * UpdateAwareness — Merlin knows what changed after each update
 * 
 * On startup, reads updates.json and compares with last-seen version.
 * New updates are surfaced to the agent via system prompt context,
 * and a one-time "update greeting" is shown on first connection.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const SEEN_FILE = path.join(DATA_DIR, 'updates-seen.json');
const UPDATES_FILE = path.join(__dirname, '..', '..', 'updates.json');

interface UpdateEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: string[];
  type: 'feature' | 'fix' | 'security' | 'improvement';
}

interface UpdatesManifest {
  version: string;
  lastUpdated: string;
  updates: UpdateEntry[];
}

interface SeenState {
  lastSeenVersion: string;
  seenIds: string[];
  lastStartup: string;
  acknowledged: boolean; // user saw the greeting
}

export class UpdateAwareness {
  private manifest: UpdatesManifest | null = null;
  private seen: SeenState;
  private newUpdates: UpdateEntry[] = [];

  constructor() {
    this.seen = this.loadSeen();
    this.loadManifest();
    this.detectNewUpdates();
  }

  private loadSeen(): SeenState {
    try {
      if (fs.existsSync(SEEN_FILE)) {
        return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8'));
      }
    } catch {}
    return {
      lastSeenVersion: '0.0.0',
      seenIds: [],
      lastStartup: new Date().toISOString(),
      acknowledged: true,
    };
  }

  private saveSeen(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SEEN_FILE, JSON.stringify(this.seen, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Updates] Failed to save seen state:', (err as Error).message);
    }
  }

  private loadManifest(): void {
    try {
      if (fs.existsSync(UPDATES_FILE)) {
        this.manifest = JSON.parse(fs.readFileSync(UPDATES_FILE, 'utf-8'));
        console.log(`[Updates] Loaded manifest v${this.manifest!.version} (${this.manifest!.updates.length} entries)`);
      } else {
        console.log('[Updates] No updates.json found');
      }
    } catch (err) {
      console.error('[Updates] Failed to load manifest:', (err as Error).message);
    }
  }

  private detectNewUpdates(): void {
    if (!this.manifest) return;

    this.newUpdates = this.manifest.updates.filter(
      u => !this.seen.seenIds.includes(u.id)
    );

    if (this.newUpdates.length > 0) {
      console.log(`[Updates] 🆕 ${this.newUpdates.length} new updates detected:`);
      for (const u of this.newUpdates) {
        console.log(`  - ${u.title} (${u.version})`);
      }
      this.seen.acknowledged = false;
    } else {
      console.log('[Updates] No new updates since last startup');
    }

    // Update seen state
    this.seen.lastSeenVersion = this.manifest.version;
    this.seen.seenIds = this.manifest.updates.map(u => u.id);
    this.seen.lastStartup = new Date().toISOString();
    this.saveSeen();
  }

  // Called on first WS connection — returns update greeting (or null if no new updates)
  getUpdateGreeting(): string | null {
    if (this.newUpdates.length === 0 || this.seen.acknowledged) return null;

    const typeEmoji: Record<string, string> = {
      feature: '✨',
      fix: '🔧',
      security: '🛡️',
      improvement: '📈',
    };

    const lines = [
      `🆕 **עודכנתי!** קיבלתי ${this.newUpdates.length} עדכונים חדשים:\n`,
    ];

    for (const u of this.newUpdates) {
      const emoji = typeEmoji[u.type] || '📦';
      lines.push(`${emoji} **${u.title}** (v${u.version})`);
      lines.push(`   ${u.summary}`);
      lines.push('');
    }

    lines.push(`אני מוכן ומעודכן — מה נעשה? 😊`);

    // Mark as acknowledged
    this.seen.acknowledged = true;
    this.saveSeen();

    return lines.join('\n');
  }

  // For system prompt context — compact summary of recent capabilities
  toContextString(): string {
    if (!this.manifest) return '';

    // Only show updates from last 7 days for prompt context
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = this.manifest.updates.filter(u => new Date(u.date).getTime() > weekAgo);

    if (recent.length === 0) return '';

    const lines = [`\n## עדכונים אחרונים שקיבלת (גרסה ${this.manifest.version})`];
    for (const u of recent.slice(0, 5)) {
      lines.push(`- **${u.title}**: ${u.summary}`);
    }
    lines.push(`אם המשתמש שואל מה חדש או מה השתנה — ספר לו על העדכונים האלה.`);

    return lines.join('\n') + '\n';
  }

  // Get current version
  getVersion(): string {
    return this.manifest?.version || 'unknown';
  }

  // Get full update history
  getHistory(): UpdateEntry[] {
    return this.manifest?.updates || [];
  }

  // Check if there are unacknowledged updates
  hasNewUpdates(): boolean {
    return this.newUpdates.length > 0 && !this.seen.acknowledged;
  }
}
