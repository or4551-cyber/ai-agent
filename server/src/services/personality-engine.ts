import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const PERSONALITY_FILE = path.join(DATA_DIR, 'personality.json');
const MAX_EPISODES = 200;
const MAX_RELATIONSHIPS = 50;
const MAX_STYLE_SAMPLES = 30;
const MAX_RESPONSE_EXAMPLES = 20;

// ===== TYPES =====

interface WritingStyle {
  avgMessageLength: number; // chars
  usesEmojis: boolean;
  emojiFrequency: number; // 0-1
  formality: 'formal' | 'casual' | 'very_casual';
  sentenceStyle: 'short' | 'medium' | 'long';
  commonPhrases: string[]; // phrases used 3+ times
  sampleMessages: string[]; // raw user messages for few-shot
  languagePreference: 'he' | 'en' | 'mixed';
}

interface EpisodicMemory {
  id: string;
  date: string;
  summary: string;
  emotion: 'happy' | 'neutral' | 'sad' | 'frustrated' | 'excited' | 'stressed';
  people: string[];
  category: 'work' | 'personal' | 'health' | 'social' | 'technical' | 'routine' | 'other';
  importance: number; // 1-10
}

interface TimePattern {
  hourlyActivity: number[]; // 24 slots, count per hour
  dayOfWeekActivity: number[]; // 7 slots (0=Sun)
  peakHours: number[];
  sleepWindow: { start: number; end: number } | null;
  workWindow: { start: number; end: number } | null;
  weekendPattern: string; // e.g. "active mornings, quiet afternoons"
}

interface Relationship {
  name: string;
  aliases: string[]; // other names/nicknames
  type: 'family' | 'friend' | 'work' | 'acquaintance' | 'service' | 'unknown';
  closeness: number; // 1-10
  platform: string | null; // WhatsApp, Telegram, etc.
  communicationStyle: string; // e.g. "casual, short messages"
  lastMentioned: string;
  mentionCount: number;
  notes: string; // e.g. "his boss, strict about deadlines"
}

interface ResponseExample {
  situation: string;
  userResponse: string;
  category: string;
}

export interface PersonalityData {
  writingStyle: WritingStyle;
  episodes: EpisodicMemory[];
  timePatterns: TimePattern;
  relationships: Relationship[];
  responseExamples: ResponseExample[];
  lastAnalysis: string | null;
  version: number;
}

const DEFAULT_DATA: PersonalityData = {
  writingStyle: {
    avgMessageLength: 0,
    usesEmojis: false,
    emojiFrequency: 0,
    formality: 'casual',
    sentenceStyle: 'medium',
    commonPhrases: [],
    sampleMessages: [],
    languagePreference: 'he',
  },
  episodes: [],
  timePatterns: {
    hourlyActivity: new Array(24).fill(0),
    dayOfWeekActivity: new Array(7).fill(0),
    peakHours: [],
    sleepWindow: null,
    workWindow: null,
    weekendPattern: '',
  },
  relationships: [],
  responseExamples: [],
  lastAnalysis: null,
  version: 1,
};

// ===== ANALYSIS PROMPT =====

const ANALYSIS_PROMPT = `אתה מנתח אישיות עמוק. קבל שיחות בין משתמש ל-AI והחזר JSON:
{
  "episodes": [
    {
      "summary": "תיאור קצר של מה שקרה",
      "emotion": "happy|neutral|sad|frustrated|excited|stressed",
      "people": ["שמות אנשים שהוזכרו"],
      "category": "work|personal|health|social|technical|routine|other",
      "importance": 1-10
    }
  ],
  "relationships": [
    {
      "name": "שם",
      "type": "family|friend|work|acquaintance|service|unknown",
      "closeness": 1-10,
      "platform": "WhatsApp|Telegram|null",
      "communicationStyle": "תיאור קצר",
      "notes": "מידע רלוונטי"
    }
  ],
  "responseExamples": [
    {
      "situation": "כשמבקשים ממנו X",
      "userResponse": "הוא עונה כך",
      "category": "communication|decisions|emotions|work"
    }
  ],
  "writingInsights": {
    "formality": "formal|casual|very_casual",
    "sentenceStyle": "short|medium|long",
    "commonPhrases": ["ביטויים חוזרים"],
    "usesEmojis": true/false
  }
}

כללים:
- episodes: רק אירועים חשובים (importance >= 5), עד 5
- relationships: רק אנשים חדשים שלא ראית קודם
- responseExamples: דפוסי תגובה ייחודיים למשתמש, עד 3
- writingInsights: רק אם ברור מספיק
- החזר JSON תקין בלבד`;

// ===== SERVICE =====

export class PersonalityEngine {
  private data: PersonalityData;
  private apiKey: string | null;
  private messageBuffer: string[] = []; // buffer user messages for style analysis
  private analysisQueue: { messages: { role: string; content: string }[] }[] = [];
  private analyzing = false;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
    this.ensureDir();
    this.data = this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  private load(): PersonalityData {
    try {
      if (fs.existsSync(PERSONALITY_FILE)) {
        const raw = JSON.parse(fs.readFileSync(PERSONALITY_FILE, 'utf-8'));
        return { ...DEFAULT_DATA, ...raw };
      }
    } catch {}
    return { ...DEFAULT_DATA };
  }

  private save(): void {
    try {
      fs.writeFileSync(PERSONALITY_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {}
  }

  // ===== 1. WRITING STYLE ANALYZER =====

  recordUserMessage(text: string): void {
    if (!text || text.length < 3) return;

    // Update message buffer
    this.messageBuffer.push(text);
    if (this.messageBuffer.length > 100) this.messageBuffer.shift();

    // Update samples (keep diverse ones)
    if (text.length > 10 && text.length < 300) {
      this.data.writingStyle.sampleMessages.push(text);
      if (this.data.writingStyle.sampleMessages.length > MAX_STYLE_SAMPLES) {
        this.data.writingStyle.sampleMessages.shift();
      }
    }

    // Real-time style metrics
    this.updateWritingMetrics(text);
    this.save();
  }

  private updateWritingMetrics(text: string): void {
    const ws = this.data.writingStyle;
    const samples = ws.sampleMessages;

    // Average length
    if (samples.length > 0) {
      ws.avgMessageLength = Math.round(samples.reduce((s, m) => s + m.length, 0) / samples.length);
    }

    // Emoji detection
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const hasEmoji = emojiRegex.test(text);
    if (hasEmoji) {
      ws.emojiFrequency = Math.min(1, ws.emojiFrequency + 0.05);
    } else {
      ws.emojiFrequency = Math.max(0, ws.emojiFrequency - 0.02);
    }
    ws.usesEmojis = ws.emojiFrequency > 0.2;

    // Sentence style
    ws.sentenceStyle = ws.avgMessageLength < 30 ? 'short' : ws.avgMessageLength < 100 ? 'medium' : 'long';

    // Language detection
    const heCount = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const enCount = (text.match(/[a-zA-Z]/g) || []).length;
    if (heCount > enCount * 2) ws.languagePreference = 'he';
    else if (enCount > heCount * 2) ws.languagePreference = 'en';
    else ws.languagePreference = 'mixed';

    // Common phrases (detect repeated 2-3 word sequences)
    this.detectCommonPhrases();
  }

  private detectCommonPhrases(): void {
    const all = this.messageBuffer.join(' ');
    const words = all.split(/\s+/);
    const phrases: Map<string, number> = new Map();

    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      phrases.set(bi, (phrases.get(bi) || 0) + 1);
      if (i < words.length - 2) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        phrases.set(tri, (phrases.get(tri) || 0) + 1);
      }
    }

    this.data.writingStyle.commonPhrases = Array.from(phrases.entries())
      .filter(([phrase, count]) => count >= 3 && phrase.length > 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  // ===== 2. EPISODIC MEMORY =====

  addEpisode(episode: Omit<EpisodicMemory, 'id' | 'date'>): void {
    const entry: EpisodicMemory = {
      id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      ...episode,
    };

    this.data.episodes.unshift(entry);
    if (this.data.episodes.length > MAX_EPISODES) {
      // Keep important ones, trim oldest low-importance
      this.data.episodes.sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      this.data.episodes = this.data.episodes.slice(0, MAX_EPISODES);
    }
    this.save();
  }

  getRecentEpisodes(limit = 10): EpisodicMemory[] {
    return this.data.episodes
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  getImportantEpisodes(limit = 10): EpisodicMemory[] {
    return this.data.episodes
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  // ===== 3. TIME PATTERNS =====

  recordActivity(): void {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    this.data.timePatterns.hourlyActivity[hour]++;
    this.data.timePatterns.dayOfWeekActivity[day]++;

    // Recalculate peak hours
    this.updateTimePatterns();
    this.save();
  }

  private updateTimePatterns(): void {
    const tp = this.data.timePatterns;
    const ha = tp.hourlyActivity;
    const total = ha.reduce((s, v) => s + v, 0);
    if (total < 10) return; // Not enough data

    const avg = total / 24;

    // Peak hours: above average
    tp.peakHours = ha.map((v, i) => ({ h: i, v }))
      .filter(x => x.v > avg * 1.5)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6)
      .map(x => x.h)
      .sort((a, b) => a - b);

    // Sleep window: consecutive low activity hours
    let minSum = Infinity, sleepStart = 0;
    for (let start = 0; start < 24; start++) {
      let sum = 0;
      for (let j = 0; j < 7; j++) {
        sum += ha[(start + j) % 24];
      }
      if (sum < minSum) {
        minSum = sum;
        sleepStart = start;
      }
    }
    tp.sleepWindow = { start: sleepStart, end: (sleepStart + 7) % 24 };

    // Work window: longest continuous high activity during weekdays
    const weekdayHours = ha.map((v, i) => ({ h: i, v }))
      .filter(x => x.h >= 8 && x.h <= 20 && x.v > avg);
    if (weekdayHours.length >= 4) {
      tp.workWindow = {
        start: weekdayHours[0].h,
        end: weekdayHours[weekdayHours.length - 1].h,
      };
    }
  }

  // ===== 4. RELATIONSHIP GRAPH =====

  updateRelationship(partial: Partial<Relationship> & { name: string }): void {
    const existing = this.data.relationships.find(
      r => r.name === partial.name || r.aliases.includes(partial.name)
    );

    if (existing) {
      existing.mentionCount++;
      existing.lastMentioned = new Date().toISOString();
      if (partial.type && partial.type !== 'unknown') existing.type = partial.type;
      if (partial.closeness) existing.closeness = Math.max(existing.closeness, partial.closeness);
      if (partial.platform) existing.platform = partial.platform;
      if (partial.communicationStyle) existing.communicationStyle = partial.communicationStyle;
      if (partial.notes) existing.notes = partial.notes;
    } else {
      this.data.relationships.push({
        name: partial.name,
        aliases: partial.aliases || [],
        type: partial.type || 'unknown',
        closeness: partial.closeness || 3,
        platform: partial.platform || null,
        communicationStyle: partial.communicationStyle || '',
        lastMentioned: new Date().toISOString(),
        mentionCount: 1,
        notes: partial.notes || '',
      });

      if (this.data.relationships.length > MAX_RELATIONSHIPS) {
        // Remove least mentioned
        this.data.relationships.sort((a, b) => b.mentionCount - a.mentionCount);
        this.data.relationships = this.data.relationships.slice(0, MAX_RELATIONSHIPS);
      }
    }
    this.save();
  }

  getRelationship(name: string): Relationship | undefined {
    return this.data.relationships.find(
      r => r.name === name || r.aliases.includes(name) ||
        r.name.includes(name) || name.includes(r.name)
    );
  }

  // ===== 5. RESPONSE MODEL (FEW-SHOT) =====

  addResponseExample(example: ResponseExample): void {
    this.data.responseExamples.push(example);
    if (this.data.responseExamples.length > MAX_RESPONSE_EXAMPLES) {
      this.data.responseExamples.shift();
    }
    this.save();
  }

  // ===== DEEP ANALYSIS (uses Claude to extract insights) =====

  async analyzeConversation(messages: { role: string; content: string }[]): Promise<void> {
    if (!this.apiKey || messages.length < 4) return;

    // Queue for analysis (non-blocking)
    this.analysisQueue.push({ messages });
    if (!this.analyzing) {
      this.processAnalysisQueue().catch(() => {});
    }
  }

  private async processAnalysisQueue(): Promise<void> {
    if (this.analyzing) return;
    this.analyzing = true;

    while (this.analysisQueue.length > 0) {
      const item = this.analysisQueue.shift()!;
      try {
        await this.runDeepAnalysis(item.messages);
      } catch (err) {
        console.error('[PersonalityEngine] Analysis error:', (err as Error).message);
      }
    }

    this.analyzing = false;
  }

  private async runDeepAnalysis(messages: { role: string; content: string }[]): Promise<void> {
    const client = new Anthropic({ apiKey: this.apiKey! });

    const summary = messages
      .filter(m => typeof m.content === 'string')
      .map(m => `[${m.role}]: ${m.content.substring(0, 250)}`)
      .slice(0, 20)
      .join('\n');

    // Include existing relationships for context
    const existingPeople = this.data.relationships.map(r => r.name).join(', ');

    const input = `שיחה:\n${summary}\n\nאנשים ידועים: ${existingPeople || 'אין עדיין'}`;

    try {
      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022', // Use Haiku for analysis (cheap)
        max_tokens: 1024,
        system: ANALYSIS_PROMPT,
        messages: [{ role: 'user', content: input }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const result = JSON.parse(jsonMatch[0]);

      // Process episodes
      if (result.episodes) {
        for (const ep of result.episodes) {
          if (ep.importance >= 5) {
            this.addEpisode({
              summary: ep.summary,
              emotion: ep.emotion || 'neutral',
              people: ep.people || [],
              category: ep.category || 'other',
              importance: ep.importance,
            });
          }
        }
      }

      // Process relationships
      if (result.relationships) {
        for (const rel of result.relationships) {
          if (rel.name) {
            this.updateRelationship(rel);
          }
        }
      }

      // Process response examples
      if (result.responseExamples) {
        for (const ex of result.responseExamples) {
          if (ex.situation && ex.userResponse) {
            this.addResponseExample(ex);
          }
        }
      }

      // Process writing insights
      if (result.writingInsights) {
        const wi = result.writingInsights;
        if (wi.formality) this.data.writingStyle.formality = wi.formality;
        if (wi.sentenceStyle) this.data.writingStyle.sentenceStyle = wi.sentenceStyle;
        if (wi.usesEmojis !== undefined) this.data.writingStyle.usesEmojis = wi.usesEmojis;
        if (wi.commonPhrases?.length > 0) {
          const existing = new Set(this.data.writingStyle.commonPhrases);
          for (const p of wi.commonPhrases) {
            existing.add(p);
          }
          this.data.writingStyle.commonPhrases = Array.from(existing).slice(0, 15);
        }
      }

      this.data.lastAnalysis = new Date().toISOString();
      this.save();

      console.log(`[PersonalityEngine] Deep analysis complete: +${result.episodes?.length || 0} episodes, +${result.relationships?.length || 0} relationships`);
    } catch (err) {
      console.error('[PersonalityEngine] API error:', (err as Error).message);
    }
  }

  // ===== CONTEXT GENERATION FOR SYSTEM PROMPT =====

  toContextString(): string {
    const sections: string[] = [];

    // Writing style
    const ws = this.data.writingStyle;
    if (ws.sampleMessages.length >= 5) {
      const formalMap = { formal: 'פורמלי', casual: 'חברי', very_casual: 'מאוד קז\'ואלי' };
      const lenMap = { short: 'קצרות', medium: 'בינוניות', long: 'ארוכות' };
      sections.push(`### סגנון כתיבה של המשתמש`);
      sections.push(`- סגנון: ${formalMap[ws.formality]}, הודעות ${lenMap[ws.sentenceStyle]}`);
      if (ws.usesEmojis) sections.push(`- משתמש באימוג'ים`);
      if (ws.commonPhrases.length > 0) {
        sections.push(`- ביטויים אופייניים: "${ws.commonPhrases.slice(0, 5).join('", "')}"`);
      }
      // Few-shot samples for mimicry
      const recentSamples = ws.sampleMessages.slice(-5);
      if (recentSamples.length > 0) {
        sections.push(`- דוגמאות לסגנון הכתיבה שלו:`);
        for (const s of recentSamples) {
          sections.push(`  > "${s.substring(0, 120)}"`);
        }
      }
    }

    // Episodic memory
    const recentEp = this.getRecentEpisodes(5);
    const importantEp = this.getImportantEpisodes(5);
    const allEp = [...new Map([...recentEp, ...importantEp].map(e => [e.id, e])).values()].slice(0, 8);
    if (allEp.length > 0) {
      sections.push(`### אירועים חשובים שקרו`);
      for (const ep of allEp) {
        const date = new Date(ep.date).toLocaleDateString('he-IL');
        const emotionMap: Record<string, string> = {
          happy: '😊', neutral: '', sad: '😔', frustrated: '😤', excited: '🤩', stressed: '😰'
        };
        sections.push(`- ${date}: ${ep.summary} ${emotionMap[ep.emotion] || ''}`);
      }
    }

    // Time patterns
    const tp = this.data.timePatterns;
    const totalActivity = tp.hourlyActivity.reduce((s, v) => s + v, 0);
    if (totalActivity > 20) {
      sections.push(`### דפוסי זמן`);
      if (tp.peakHours.length > 0) {
        sections.push(`- שעות שיא: ${tp.peakHours.map(h => `${h}:00`).join(', ')}`);
      }
      if (tp.sleepWindow) {
        sections.push(`- שינה בערך: ${tp.sleepWindow.start}:00 — ${tp.sleepWindow.end}:00`);
      }
      if (tp.workWindow) {
        sections.push(`- עבודה בערך: ${tp.workWindow.start}:00 — ${tp.workWindow.end}:00`);
      }
    }

    // Relationships
    const topRels = this.data.relationships
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10);
    if (topRels.length > 0) {
      sections.push(`### אנשים חשובים בחייו`);
      const typeMap: Record<string, string> = {
        family: 'משפחה', friend: 'חבר', work: 'עבודה',
        acquaintance: 'מכר', service: 'נותן שירות', unknown: '',
      };
      for (const r of topRels) {
        let line = `- **${r.name}** (${typeMap[r.type] || r.type}, קרבה ${r.closeness}/10)`;
        if (r.notes) line += ` — ${r.notes}`;
        if (r.platform) line += ` [${r.platform}]`;
        sections.push(line);
      }
    }

    // Response patterns
    if (this.data.responseExamples.length >= 3) {
      sections.push(`### איך המשתמש מגיב למצבים`);
      for (const ex of this.data.responseExamples.slice(-5)) {
        sections.push(`- ${ex.situation} → "${ex.userResponse}"`);
      }
    }

    if (sections.length === 0) return '';
    return `\n## העתק דיגיטלי — מה שמרלין למד עליך ברמה עמוקה\n${sections.join('\n')}\n`;
  }

  // ===== PUBLIC GETTERS =====

  getData(): PersonalityData {
    return this.data;
  }

  getWritingStyle(): WritingStyle {
    return this.data.writingStyle;
  }

  getRelationships(): Relationship[] {
    return this.data.relationships;
  }

  getTimePatterns(): TimePattern {
    return this.data.timePatterns;
  }
}
