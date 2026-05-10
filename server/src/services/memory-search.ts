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

export function search(query: string, limit = 5): MemoryHit[] {
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

export function searchAsText(query: string, limit = 5): string {
  const hits = search(query, limit);
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
  return lines.join('\n');
}
