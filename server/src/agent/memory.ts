import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');

export interface MemoryEntry {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export class AgentMemory {
  private memories: Map<string, MemoryEntry> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        for (const entry of data) {
          this.memories.set(entry.key, entry);
        }
      }
    } catch {
      // Start fresh if file is corrupt
    }
  }

  private save(): void {
    try {
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }
      const data = Array.from(this.memories.values());
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save memory:', err);
    }
  }

  set(key: string, value: string): void {
    const now = new Date().toISOString();
    const existing = this.memories.get(key);
    this.memories.set(key, {
      key,
      value,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    this.save();
  }

  get(key: string): string | undefined {
    return this.memories.get(key)?.value;
  }

  delete(key: string): boolean {
    const existed = this.memories.delete(key);
    if (existed) this.save();
    return existed;
  }

  list(): MemoryEntry[] {
    return Array.from(this.memories.values());
  }

  search(query: string): MemoryEntry[] {
    const q = query.toLowerCase();
    return this.list().filter(
      (m) => m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    );
  }

  toContextString(): string {
    const entries = this.list();
    if (entries.length === 0) return '';
    const lines = entries.map((m) => `- ${m.key}: ${m.value}`);
    return `\n## מה שאתה זוכר על המשתמש:\n${lines.join('\n')}\n`;
  }
}
