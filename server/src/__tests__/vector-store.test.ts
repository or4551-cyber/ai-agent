import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cosine } from '../services/embeddings';

let tmpHome: string;
let prevHome: string | undefined;

beforeEach(() => {
  prevHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-vec-'));
  process.env.HOME = tmpHome;
  vi.resetModules();
});

afterEach(() => {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe('cosine', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns 0 when dimensions mismatch (defensive, not a throw)', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });

  it('handles zero vector without divide-by-zero', () => {
    expect(cosine([0, 0, 0], [1, 1, 1])).toBe(0);
  });
});

describe('VectorStore', () => {
  it('search ranks by similarity and respects minScore + limit', async () => {
    const { VectorStore } = await import('../services/vector-store');
    const store = new VectorStore();

    store.upsert({ id: 'a', source: 'memory', ref: 'a', text: 'a', vec: [1, 0, 0], ts: 1 });
    store.upsert({ id: 'b', source: 'memory', ref: 'b', text: 'b', vec: [0.9, 0.1, 0], ts: 2 });
    store.upsert({ id: 'c', source: 'memory', ref: 'c', text: 'c', vec: [0, 1, 0], ts: 3 });

    const results = store.search([1, 0, 0], 5, 0.5);
    expect(results.length).toBe(2); // c is too dissimilar
    expect(results[0].item.id).toBe('a'); // perfect match first
    expect(results[1].item.id).toBe('b');
  });

  it('upsert overwrites by id', async () => {
    const { VectorStore } = await import('../services/vector-store');
    const store = new VectorStore();
    store.upsert({ id: 'x', source: 'memory', ref: 'x', text: 'first', vec: [1, 0], ts: 1 });
    store.upsert({ id: 'x', source: 'memory', ref: 'x', text: 'second', vec: [0, 1], ts: 2 });
    expect(store.size()).toBe(1);
    const hits = store.search([0, 1], 1, 0);
    expect(hits[0].item.text).toBe('second');
  });

  it('flushNow persists to disk and reload sees the same items', async () => {
    const { VectorStore } = await import('../services/vector-store');
    const a = new VectorStore();
    a.upsert({ id: 'x', source: 'note', ref: 'x', text: 'persisted', vec: [1, 0], ts: 1 });
    a.flushNow();

    // Fresh instance — must read from disk.
    const b = new VectorStore();
    expect(b.size()).toBe(1);
    const hits = b.search([1, 0], 1, 0);
    expect(hits[0].item.text).toBe('persisted');
  });
});
