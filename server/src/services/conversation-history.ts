import fs from 'fs';
import path from 'path';
import { Conversation, ChatMessage } from '../types';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const HISTORY_DIR = path.join(DATA_DIR, 'conversations');
const INDEX_FILE = path.join(HISTORY_DIR, 'index.json');
const MAX_CONVERSATIONS = 100;

interface ConversationIndex {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export class ConversationHistoryService {
  private index: ConversationIndex[] = [];

  constructor() {
    this.ensureDirs();
    this.loadIndex();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
  }

  private loadIndex(): void {
    try {
      if (fs.existsSync(INDEX_FILE)) {
        this.index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
      }
    } catch { this.index = []; }
  }

  private saveIndex(): void {
    try {
      fs.writeFileSync(INDEX_FILE, JSON.stringify(this.index, null, 2), 'utf-8');
    } catch {}
  }

  private conversationPath(id: string): string {
    return path.join(HISTORY_DIR, `${id}.json`);
  }

  list(limit = 20, offset = 0): { conversations: ConversationIndex[]; total: number } {
    const sorted = this.index.sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      conversations: sorted.slice(offset, offset + limit),
      total: this.index.length,
    };
  }

  get(id: string): Conversation | null {
    try {
      const filePath = this.conversationPath(id);
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }
  }

  save(conversation: Conversation): void {
    try {
      // Save full conversation
      fs.writeFileSync(
        this.conversationPath(conversation.id),
        JSON.stringify(conversation, null, 2),
        'utf-8'
      );

      // Update index
      const preview = this.extractPreview(conversation.messages);
      const existing = this.index.findIndex(c => c.id === conversation.id);
      const entry: ConversationIndex = {
        id: conversation.id,
        title: conversation.title || this.generateTitle(conversation.messages),
        preview,
        messageCount: conversation.messages.length,
        createdAt: conversation.createdAt,
        updatedAt: Date.now(),
      };

      if (existing >= 0) {
        this.index[existing] = entry;
      } else {
        this.index.unshift(entry);
      }

      // Trim old conversations
      if (this.index.length > MAX_CONVERSATIONS) {
        const removed = this.index.splice(MAX_CONVERSATIONS);
        for (const r of removed) {
          try { fs.unlinkSync(this.conversationPath(r.id)); } catch {}
        }
      }

      this.saveIndex();
    } catch {}
  }

  delete(id: string): boolean {
    const idx = this.index.findIndex(c => c.id === id);
    if (idx < 0) return false;
    this.index.splice(idx, 1);
    try { fs.unlinkSync(this.conversationPath(id)); } catch {}
    this.saveIndex();
    return true;
  }

  deleteAll(): void {
    for (const c of this.index) {
      try { fs.unlinkSync(this.conversationPath(c.id)); } catch {}
    }
    this.index = [];
    this.saveIndex();
  }

  private extractPreview(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user');
    if (!first) return '';
    return first.content.substring(0, 100);
  }

  private generateTitle(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user');
    if (!first) return 'שיחה חדשה';
    const text = first.content.trim();
    if (text.length <= 40) return text;
    return text.substring(0, 40) + '...';
  }
}
