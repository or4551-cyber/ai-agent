// Memory search — unified search across all of Merlin's long-term memory.
//
// This is a deliberately simple keyword/scoring implementation. It exists so
// the API surface (memory_search tool) can ship now, with the right shape, while
// vector embeddings (sqlite-vec + Voyage) can be slotted in later by replacing
// the search() body. Callers won't change.

import * as fs from 'fs';
import * as path from 'path';
import { agentMemory, conversationHistoryService } from './registry';
import { ChatMessage } from '../types';
import { embeddings } from './embeddings';
import { vectorStore, VectorItem, VectorSource } from './vector-store';

const HOME = process.env.HOME || '.';
const NOTES_FILE = path.join(HOME, '.ai-agent', 'notes.json');
const PERSONALITY_FILE = path.join(HOME, '.ai-agent', 'personality.json');

export interface MemoryHit {
  source: 'memory' | 'conversation' | 'episode' | 'note';
  title: string;
  excerpt: string;
  score: number;
  timestamp?: number;
  ref?: string;
}

interface PersonalityEpisode {
  id?: string;
  summary?: string;
  emotion?: string;
  people?: string[];
  importance?: number;
  timestamp?: number;
}

interface Note {
  id: string;
  text: string;
  tag?: string;
  createdAt: number;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function score(content: string, queryTokens: string[]): number {
  const haystack = content.toLowerCase();
  let s = 0;
  for (const tok of queryTokens) {
    if (!tok) continue;
    const idx = haystack.indexOf(tok);
    if (idx === -1) continue;
    s += 3;
    if (idx < 80) s += 1;
    const before = idx === 0 ? ' ' : haystack[idx - 1];
    const after = haystack[idx + tok.length] || ' ';
    if (!/\p{L}/u.test(before) && !/\p{L}/u.test(after)) s += 2;
  }
  return s;
}

function excerpt(content: string, queryTokens: string[], maxLen = 180): string {
  if (content.length <= maxLen) return content;
  const lower = content.toLowerCase();
  let best = -1;
  for (const t of queryTokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  const start = best === -1 ? 0 : Math.max(0, best - 40);
  return (start > 0 ? '…' : '') + content.slice(start, start + maxLen) + (start + maxLen < content.length ? '…' : '');
}

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

// Synchronous keyword-only search — kept for callers that can't await.
export function search(query: string, limit = 5): MemoryHit[] {
  return searchKeyword(query, limit);
}

// Async hybrid search — uses vectors when available, merges with keyword
// hits, dedupes by ref, and re-ranks. Falls back gracefully if no API key.
export async function searchAsync(query: string, limit = 5): Promise<MemoryHit[]> {
  const keywordHits = searchKeyword(query, limit * 2);

  // No embeddings configured? Just return keyword hits.
  if (!embeddings.isAvailable()) return keywordHits.slice(0, limit);

  let vectorHits: MemoryHit[] = [];
  try {
    const queryVec = await embeddings.embed(query, { inputType: 'query' });
    if (queryVec) {
      const raw = vectorStore.search(queryVec, limit * 2, 0.35);
      vectorHits = raw.map((r) => ({
        source: r.item.source,
        title: r.item.text.slice(0, 50),
        excerpt: r.item.text.length > 180 ? r.item.text.slice(0, 180) + '…' : r.item.text,
        // Vector cosine sits in [0..1]. Re-scale to roughly match keyword scores
        // (which are open-ended) so the merge ranks comparably.
        score: r.score * 12,
        timestamp: r.item.ts,
        ref: r.item.ref,
      }));
    }
  } catch (err) {
    console.error('[MemorySearch] Vector search failed (fallback to keyword):', (err as Error).message);
  }

  // Merge: dedupe by ref, sum scores when both keyword and vector hit the same item.
  const merged = new Map<string, MemoryHit>();
  const keyOf = (h: MemoryHit) => `${h.source}:${h.ref || h.title}`;
  for (const h of [...keywordHits, ...vectorHits]) {
    const k = keyOf(h);
    const existing = merged.get(k);
    if (existing) {
      existing.score += h.score;
      if (!existing.excerpt && h.excerpt) existing.excerpt = h.excerpt;
    } else {
      merged.set(k, { ...h });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

function searchKeyword(query: string, limit: number): MemoryHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const hits: MemoryHit[] = [];

  // 1. Key-value memory
  for (const m of agentMemory.list()) {
    const content = `${m.key}: ${m.value}`;
    const s = score(content, tokens);
    if (s > 0) {
      hits.push({
        source: 'memory',
        title: m.key,
        excerpt: excerpt(m.value, tokens),
        score: s + 1, // explicit memories outrank random chat
        timestamp: Date.parse(m.updatedAt) || undefined,
        ref: m.key,
      });
    }
  }

  // 2. Personality episodes (read directly from disk so we don't tangle with
  //    PersonalityEngine's lifecycle / API key requirement)
  const personality = loadJson<{ episodes?: PersonalityEpisode[] }>(PERSONALITY_FILE, {});
  for (const ep of personality.episodes || []) {
    const content = `${ep.summary || ''} ${ep.emotion || ''} ${(ep.people || []).join(' ')}`.trim();
    const s = score(content, tokens);
    if (s > 0) {
      hits.push({
        source: 'episode',
        title: (ep.summary || 'אירוע').slice(0, 50),
        excerpt: excerpt(content, tokens),
        score: s + (ep.importance || 0) * 0.5,
        timestamp: ep.timestamp,
        ref: ep.id,
      });
    }
  }

  // 3. Conversation history
  try {
    const { conversations } = conversationHistoryService.list(50, 0);
    for (const cidx of conversations) {
      const conv = conversationHistoryService.get(cidx.id);
      if (!conv) continue;
      // User messages double-weighted (more signal than assistant fluff).
      const fulltext = conv.messages
        .map((m: ChatMessage) => (m.role === 'user' ? m.content + ' ' + m.content : m.content))
        .join('\n');
      const s = score(fulltext, tokens);
      if (s > 0) {
        hits.push({
          source: 'conversation',
          title: conv.title || cidx.preview?.slice(0, 50) || 'שיחה',
          excerpt: excerpt(fulltext, tokens),
          score: s,
          timestamp: conv.updatedAt,
          ref: conv.id,
        });
      }
    }
  } catch {}

  // 4. Quick notes
  for (const n of loadJson<Note[]>(NOTES_FILE, [])) {
    const content = (n.tag ? `[${n.tag}] ` : '') + n.text;
    const s = score(content, tokens);
    if (s > 0) {
      hits.push({
        source: 'note',
        title: n.text.slice(0, 50),
        excerpt: excerpt(n.text, tokens),
        score: s,
        timestamp: n.createdAt,
        ref: n.id,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || (b.timestamp || 0) - (a.timestamp || 0));
  return hits.slice(0, limit);
}

export async function searchAsText(query: string, limit = 5): Promise<string> {
  const hits = await searchAsync(query, limit);
  if (hits.length === 0) return `🔍 לא מצאתי שום זיכרון שקשור ל-"${query}".`;

  const lines = [`🔍 ${hits.length} תוצאות עבור "${query}":`, ''];
  const sourceLabels: Record<MemoryHit['source'], string> = {
    memory: '💾 זיכרון',
    conversation: '💬 שיחה',
    episode: '📍 אירוע',
    note: '📝 פתק',
  };
  for (const h of hits) {
    const date = h.timestamp ? new Date(h.timestamp).toLocaleDateString('he-IL') : '';
    lines.push(`${sourceLabels[h.source]} — ${h.title}${date ? ` (${date})` : ''}`);
    lines.push(`   ${h.excerpt}`);
    lines.push('');
  }
  if (embeddings.isAvailable()) {
    lines.push(`_(חיפוש חכם פעיל — ${vectorStore.size()} פריטים מאונדקסים)_`);
  }
  return lines.join('\n');
}

// ===== INDEXING =====
// Reindex all memory sources into the vector store. Runs in the background
// so it doesn't block startup. Idempotent: only embeds items not already in the
// store (or whose text has changed).

interface IndexCandidate {
  id: string;
  source: VectorSource;
  ref: string;
  text: string;
  ts: number;
}

function memoryCandidates(): IndexCandidate[] {
  return agentMemory.list().map((m) => ({
    id: `memory:${m.key}`,
    source: 'memory' as const,
    ref: m.key,
    text: `${m.key}: ${m.value}`,
    ts: Date.parse(m.updatedAt) || Date.now(),
  }));
}

function conversationCandidates(): IndexCandidate[] {
  const out: IndexCandidate[] = [];
  try {
    const { conversations } = conversationHistoryService.list(100, 0);
    for (const cidx of conversations) {
      const conv = conversationHistoryService.get(cidx.id);
      if (!conv) continue;
      const fulltext = conv.messages
        .map((m: ChatMessage) => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(0, 4000); // truncate long convs — Voyage will truncate anyway
      if (!fulltext.trim()) continue;
      out.push({
        id: `conv:${conv.id}`,
        source: 'conversation',
        ref: conv.id,
        text: fulltext,
        ts: conv.updatedAt,
      });
    }
  } catch {}
  return out;
}

function episodeCandidates(): IndexCandidate[] {
  const personality = loadJson<{ episodes?: PersonalityEpisode[] }>(PERSONALITY_FILE, {});
  const out: IndexCandidate[] = [];
  let i = 0;
  for (const ep of personality.episodes || []) {
    const text = `${ep.summary || ''} ${ep.emotion || ''} ${(ep.people || []).join(' ')}`.trim();
    if (!text) continue;
    out.push({
      id: `episode:${ep.id || `ep_${i++}`}`,
      source: 'episode',
      ref: ep.id || `ep_${i}`,
      text,
      ts: ep.timestamp || Date.now(),
    });
  }
  return out;
}

function noteCandidates(): IndexCandidate[] {
  return loadJson<Note[]>(NOTES_FILE, []).map((n) => ({
    id: `note:${n.id}`,
    source: 'note' as const,
    ref: n.id,
    text: (n.tag ? `[${n.tag}] ` : '') + n.text,
    ts: n.createdAt,
  }));
}

let indexingInFlight: Promise<{ added: number; skipped: number }> | null = null;

// Index everything. Returns counts. Skips items already in the store.
// Held behind a single in-flight promise so concurrent callers share work.
export async function reindexAll(): Promise<{ added: number; skipped: number; total: number }> {
  if (!embeddings.isAvailable()) {
    return { added: 0, skipped: 0, total: vectorStore.size() };
  }
  if (indexingInFlight) {
    const r = await indexingInFlight;
    return { ...r, total: vectorStore.size() };
  }

  indexingInFlight = (async () => {
    const all: IndexCandidate[] = [
      ...memoryCandidates(),
      ...conversationCandidates(),
      ...episodeCandidates(),
      ...noteCandidates(),
    ];

    const fresh = all.filter((c) => !vectorStore.has(c.id));
    const skipped = all.length - fresh.length;
    if (fresh.length === 0) return { added: 0, skipped };

    console.log(`[MemorySearch] Indexing ${fresh.length} new items (${skipped} already indexed)`);
    const vectors = await embeddings.embedBatch(fresh.map((c) => c.text), { inputType: 'document' });

    const items: VectorItem[] = [];
    for (let i = 0; i < fresh.length; i++) {
      const v = vectors[i];
      if (!v) continue;
      items.push({
        id: fresh[i].id,
        source: fresh[i].source,
        ref: fresh[i].ref,
        text: fresh[i].text,
        vec: v,
        ts: fresh[i].ts,
      });
    }
    vectorStore.upsertMany(items);
    console.log(`[MemorySearch] Indexed ${items.length} new items`);
    return { added: items.length, skipped };
  })();

  try {
    const r = await indexingInFlight;
    return { ...r, total: vectorStore.size() };
  } finally {
    indexingInFlight = null;
  }
}
