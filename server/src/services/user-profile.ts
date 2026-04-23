import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const PROFILE_FILE = path.join(DATA_DIR, 'user-profile.json');

export interface UserPreference {
  key: string;
  value: string;
  confidence: number; // 0-1 how sure we are
  source: 'learned' | 'explicit' | 'inferred';
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  timestamp: string;
  topics: string[];
  toolsUsed: string[];
  sentiment: 'positive' | 'neutral' | 'frustrated';
  language: 'he' | 'en' | 'mixed';
}

export interface UserProfile {
  // Core identity
  name: string | null;
  language: 'he' | 'en' | 'mixed';
  
  // Learned preferences
  preferences: UserPreference[];
  
  // Usage patterns
  activeHours: number[]; // hours of day (0-23) user is active
  topTools: { tool: string; count: number }[];
  topTopics: { topic: string; count: number }[];
  
  // Conversation history summaries
  recentConversations: ConversationSummary[];
  
  // Communication style
  style: {
    verbosity: 'brief' | 'normal' | 'detailed';
    techLevel: 'basic' | 'intermediate' | 'advanced';
    tone: 'formal' | 'casual';
  };
  
  // Stats
  totalConversations: number;
  totalMessages: number;
  firstSeen: string;
  lastSeen: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: null,
  language: 'he',
  preferences: [],
  activeHours: [],
  topTools: [],
  topTopics: [],
  recentConversations: [],
  style: { verbosity: 'normal', techLevel: 'intermediate', tone: 'casual' },
  totalConversations: 0,
  totalMessages: 0,
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
};

export class UserProfileService {
  private profile: UserProfile;

  constructor() {
    this.ensureDir();
    this.profile = this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): UserProfile {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
        return { ...DEFAULT_PROFILE, ...data };
      }
    } catch {}
    return { ...DEFAULT_PROFILE };
  }

  private save(): void {
    try {
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(this.profile, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserProfile] Save error:', (err as Error).message);
    }
  }

  // ====== GETTERS ======

  getProfile(): UserProfile {
    return this.profile;
  }

  getPreference(key: string): string | undefined {
    return this.profile.preferences.find(p => p.key === key)?.value;
  }

  // ====== UPDATERS ======

  recordActivity(): void {
    const hour = new Date().getHours();
    if (!this.profile.activeHours.includes(hour)) {
      this.profile.activeHours.push(hour);
      this.profile.activeHours.sort((a, b) => a - b);
    }
    this.profile.lastSeen = new Date().toISOString();
    this.save();
  }

  recordMessage(): void {
    this.profile.totalMessages++;
    this.save();
  }

  recordConversation(summary: ConversationSummary): void {
    this.profile.totalConversations++;
    this.profile.recentConversations.unshift(summary);
    // Keep last 50
    this.profile.recentConversations = this.profile.recentConversations.slice(0, 50);

    // Update top tools
    for (const tool of summary.toolsUsed) {
      const existing = this.profile.topTools.find(t => t.tool === tool);
      if (existing) existing.count++;
      else this.profile.topTools.push({ tool, count: 1 });
    }
    this.profile.topTools.sort((a, b) => b.count - a.count);
    this.profile.topTools = this.profile.topTools.slice(0, 15);

    // Update top topics
    for (const topic of summary.topics) {
      const existing = this.profile.topTopics.find(t => t.topic === topic);
      if (existing) existing.count++;
      else this.profile.topTopics.push({ topic, count: 1 });
    }
    this.profile.topTopics.sort((a, b) => b.count - a.count);
    this.profile.topTopics = this.profile.topTopics.slice(0, 15);

    // Update language preference
    this.profile.language = summary.language;

    this.save();
  }

  setPreference(key: string, value: string, source: 'learned' | 'explicit' | 'inferred' = 'learned', confidence = 0.7): void {
    const existing = this.profile.preferences.find(p => p.key === key);
    if (existing) {
      existing.value = value;
      existing.confidence = Math.min(1, Math.max(existing.confidence, confidence));
      existing.updatedAt = new Date().toISOString();
      existing.source = source;
    } else {
      this.profile.preferences.push({
        key, value, confidence, source,
        updatedAt: new Date().toISOString(),
      });
    }
    // Keep preferences trimmed
    this.profile.preferences = this.profile.preferences.slice(0, 50);
    this.save();
  }

  setName(name: string): void {
    this.profile.name = name;
    this.save();
  }

  updateStyle(partial: Partial<UserProfile['style']>): void {
    this.profile.style = { ...this.profile.style, ...partial };
    this.save();
  }

  // ====== CONTEXT GENERATION ======

  toContextString(): string {
    const p = this.profile;
    const lines: string[] = [];

    if (p.name) lines.push(`- שם המשתמש: ${p.name}`);

    // Style preferences
    const verbMap = { brief: 'תמציתי', normal: 'רגיל', detailed: 'מפורט' };
    const techMap = { basic: 'בסיסי', intermediate: 'בינוני', advanced: 'מתקדם' };
    lines.push(`- סגנון תקשורת: ${verbMap[p.style.verbosity]}, רמה טכנית ${techMap[p.style.techLevel]}`);

    // Top topics
    if (p.topTopics.length > 0) {
      lines.push(`- נושאים שמעניינים אותו: ${p.topTopics.slice(0, 5).map(t => t.topic).join(', ')}`);
    }

    // Top tools
    if (p.topTools.length > 0) {
      lines.push(`- כלים שמשתמש בהם הרבה: ${p.topTools.slice(0, 5).map(t => t.tool).join(', ')}`);
    }

    // Active hours
    if (p.activeHours.length > 3) {
      const peak = this.getPeakHours();
      lines.push(`- שעות פעילות עיקריות: ${peak}`);
    }

    // Key preferences
    const importantPrefs = p.preferences.filter(pr => pr.confidence >= 0.6).slice(0, 8);
    for (const pref of importantPrefs) {
      lines.push(`- ${pref.key}: ${pref.value}`);
    }

    // Stats
    lines.push(`- שיחות עד כה: ${p.totalConversations}, הודעות: ${p.totalMessages}`);

    if (lines.length === 0) return '';
    return `\n## פרופיל המשתמש (למידה מצטברת):\n${lines.join('\n')}\n`;
  }

  private getPeakHours(): string {
    const hours = this.profile.activeHours;
    if (hours.length === 0) return 'לא ידוע';
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    return `${min}:00 — ${max}:00`;
  }
}
