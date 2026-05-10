// Pure-JS vector store. Backed by a single JSON file on disk.
//
// Why not sqlite-vec / hnswlib: those are native modules that need
// node-gyp + a working C++ toolchain. On Termux that's a 500MB install pain.
// Plain JSON + cosine similarity scales to thousands of vectors fine for
// a personal assistant — at 512 dims and 5K items, query takes <50ms.
// When the user's corpus grows to 100K+ items we'll revisit.
//
// Persistence shape:
//   { version: 1, items: [{ id, source, ref, text, vec, ts, meta? }, ...] }
// Vectors are stored as plain number arrays; gzip would help but Node has
// no streaming gzip JSON without extra deps and we want this minimal.

import * as fs from 'fs';
import * as path from 'path';
import { cosine } from './embeddings';

const HOME = process.env.HOME || '.';
const STORE_FILE = path.join(HOME, '.ai-agent', 'vector-store.json');

export type VectorSource = 'memory' | 'conversation' | 'episode' | 'note';

export interface VectorItem {
  id: string; // unique within source: e.g. memory:user_name, conv:abc, episode:ep_1
  source: VectorSource;
  ref: string; // original key — caller uses this to look up full content
  text: string; // text that was embedded, kept for excerpt rendering
  vec: number[];
  ts: number;
  meta?: Record<string, unknown>;
}

interface StoreFile {
  version: 1;
  items: VectorItem[];
}

export class VectorStore {
  private items: Map<string, VectorItem> = new Map();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(STORE_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoreFile;
      if (raw.version !== 1) {
        console.warn('[VectorStore] Unknown version, starting fresh');
        return;
      }
      for (const it of raw.items) this.items.set(it.id, it);
      console.log(`[VectorStore] Loaded ${this.items.size} vectors`);
    } catch (err) {
      console.error('[VectorStore] Load failed:', (err as Error).message);
    }
  }

  // Debounced write — multiple upserts in quick succession share one disk write.
  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 1500);
  }

  private flush(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
      const payload: StoreFile = { version: 1, items: [...this.items.values()] };
      const tmp = STORE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(payload));
      fs.renameSync(tmp, STORE_FILE); // atomic on POSIX
      this.dirty = false;
    } catch (err) {
      console.error('[VectorStore] Flush failed:', (err as Error).message);
    }
  }

  upsert(item: VectorItem): void {
    this.items.set(item.id, item);
    this.scheduleFlush();
  }

  upsertMany(items: VectorItem[]): void {
    for (const it of items) this.items.set(it.id, it);
    this.scheduleFlush();
  }

  delete(id: string): boolean {
    const ok = this.items.delete(id);
    if (ok) this.scheduleFlush();
    return ok;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  size(): number {
    return this.items.size;
  }

  // O(n) cosine search. n is small (<10K typical) so we don't need ANN.
  search(query: number[], limit = 10, minScore = 0.3): { item: VectorItem; score: number }[] {
    const results: { item: VectorItem; score: number }[] = [];
    for (const item of this.items.values()) {
      const score = cosine(query, item.vec);
      if (score >= minScore) {
        results.push({ item, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // Synchronous flush — call from drain handler so vectors persist on shutdown.
  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  stats(): { total: number; bySource: Record<VectorSource, number> } {
    const bySource = { memory: 0, conversation: 0, episode: 0, note: 0 } as Record<VectorSource, number>;
    for (const it of this.items.values()) bySource[it.source]++;
    return { total: this.items.size, bySource };
  }
}

export const vectorStore = new VectorStore();
