import Anthropic from '@anthropic-ai/sdk';
import { UserProfileService, ConversationSummary } from './user-profile';

const LEARNER_PROMPT = `אתה מערכת למידה שמנתחת שיחות בין AI agent למשתמש.
המטרה שלך: לחלץ תובנות על המשתמש כדי שהסוכן ישתפר בפעם הבאה.

קבל סיכום שיחה, וחזור JSON מדויק:
{
  "topics": ["נושא1", "נושא2"],
  "toolsUsed": ["tool1", "tool2"],
  "sentiment": "positive" | "neutral" | "frustrated",
  "language": "he" | "en" | "mixed",
  "learnedPreferences": [
    { "key": "מפתח", "value": "ערך", "confidence": 0.8 }
  ],
  "userName": null | "שם שזוהה",
  "styleUpdates": {
    "verbosity": null | "brief" | "normal" | "detailed",
    "techLevel": null | "basic" | "intermediate" | "advanced"
  },
  "suggestedMemories": [
    { "key": "מפתח", "value": "ערך" }
  ]
}

כללים:
- topics: עד 3 נושאים עיקריים (עברית)
- learnedPreferences: רק דברים שלמדת ברמת ביטחון טובה
- userName: רק אם המשתמש הזדהה בשם
- styleUpdates: null אם לא ברור
- suggestedMemories: מידע שכדאי לזכור לטווח ארוך (עובדות ספציפיות)
- sentiment: frustrated רק אם המשתמש באמת התלונן או שחזר על בקשות
- החזר JSON תקין בלבד, בלי טקסט נוסף`;

interface LearnerResult {
  topics: string[];
  toolsUsed: string[];
  sentiment: 'positive' | 'neutral' | 'frustrated';
  language: 'he' | 'en' | 'mixed';
  learnedPreferences: { key: string; value: string; confidence: number }[];
  userName: string | null;
  styleUpdates: {
    verbosity: 'brief' | 'normal' | 'detailed' | null;
    techLevel: 'basic' | 'intermediate' | 'advanced' | null;
  };
  suggestedMemories: { key: string; value: string }[];
}

export class ConversationLearner {
  private apiKey: string;
  private userProfile: UserProfileService;

  constructor(apiKey: string, userProfile: UserProfileService) {
    this.apiKey = apiKey;
    this.userProfile = userProfile;
  }

  async learnFromConversation(
    conversationId: string,
    messages: { role: string; content: string }[],
    toolsUsed: string[]
  ): Promise<void> {
    if (messages.length < 2) return; // Skip trivial conversations

    try {
      const result = await this.analyze(messages, toolsUsed);
      if (!result) return;

      // Record conversation summary
      const summary: ConversationSummary = {
        id: conversationId,
        timestamp: new Date().toISOString(),
        topics: result.topics,
        toolsUsed: result.toolsUsed.length > 0 ? result.toolsUsed : toolsUsed,
        sentiment: result.sentiment,
        language: result.language,
      };
      this.userProfile.recordConversation(summary);

      // Apply learned preferences
      for (const pref of result.learnedPreferences) {
        this.userProfile.setPreference(pref.key, pref.value, 'learned', pref.confidence);
      }

      // Update name if found
      if (result.userName) {
        this.userProfile.setName(result.userName);
      }

      // Update communication style
      if (result.styleUpdates.verbosity) {
        this.userProfile.updateStyle({ verbosity: result.styleUpdates.verbosity });
      }
      if (result.styleUpdates.techLevel) {
        this.userProfile.updateStyle({ techLevel: result.styleUpdates.techLevel });
      }

      console.log(`[Learner] Analyzed conversation ${conversationId}: ${result.topics.join(', ')} | sentiment=${result.sentiment} | prefs=${result.learnedPreferences.length}`);
    } catch (err) {
      console.error('[Learner] Error:', (err as Error).message);
    }
  }

  private async analyze(
    messages: { role: string; content: string }[],
    toolsUsed: string[]
  ): Promise<LearnerResult | null> {
    const client = new Anthropic({ apiKey: this.apiKey });

    // Summarize conversation (keep it short to save tokens)
    const summary = messages
      .filter(m => typeof m.content === 'string')
      .map(m => `[${m.role}]: ${(m.content as string).substring(0, 200)}`)
      .slice(0, 20) // Max 20 messages
      .join('\n');

    const input = `שיחה:\n${summary}\n\nכלים שהופעלו: ${toolsUsed.join(', ') || 'אין'}`;

    try {
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307', // Cheap model for background analysis
        max_tokens: 512,
        system: LEARNER_PROMPT,
        messages: [{ role: 'user', content: input }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LearnerResult;
      }
    } catch (err) {
      console.error('[Learner] API error:', (err as Error).message);
    }

    return null;
  }
}
