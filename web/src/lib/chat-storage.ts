import {
  saveConversation as saveToServer,
  deleteConversation as deleteFromServer,
  getConversations as getFromServer,
} from './api';

const STORAGE_KEY = 'ai-agent-conversations';
const MAX_CONVERSATIONS = 50;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: string;
    status: string;
  }[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

function getConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Storage full — remove oldest
    const trimmed = convos.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}

export function listConversations(): Conversation[] {
  return getConversations().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getConversation(id: string): Conversation | undefined {
  return getConversations().find((c) => c.id === id);
}

export function saveConversation(convo: Conversation): void {
  const convos = getConversations();
  const idx = convos.findIndex((c) => c.id === convo.id);
  if (idx >= 0) {
    convos[idx] = convo;
  } else {
    convos.unshift(convo);
  }
  saveConversations(convos);

  // Also persist to server (fire-and-forget)
  saveToServer({
    id: convo.id,
    title: convo.title,
    messages: convo.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
      toolCalls: m.toolCalls as any,
    })),
    createdAt: new Date(convo.createdAt).getTime(),
    updatedAt: Date.now(),
  }).catch(() => {});
}

export function deleteConversation(id: string): void {
  const convos = getConversations().filter((c) => c.id !== id);
  saveConversations(convos);
  deleteFromServer(id).catch(() => {});
}

export function generateTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New Chat';
  const text = first.content.slice(0, 50);
  return text.length < first.content.length ? text + '...' : text;
}

// Sync: load from server if localStorage is empty
export async function syncFromServer(): Promise<Conversation[]> {
  try {
    const local = getConversations();
    if (local.length > 0) return local;
    const remote = await getFromServer();
    if (remote.conversations.length > 0) {
      // Import from server
      for (const c of remote.conversations) {
        // These are summaries, skip full import for now
      }
    }
    return local;
  } catch {
    return getConversations();
  }
}
