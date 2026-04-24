import Anthropic from '@anthropic-ai/sdk';
import { AnalysisResult } from './analyzer';

const DIGEST_PROMPT = `אתה עוזר אישי חכם שרץ ברקע על הטלפון של המשתמש.
קיבלת סיכום יומי של פעילות המכשיר. בהתבסס על הנתונים, תן 3-5 המלצות קצרות ומעשיות.

סוגי המלצות אפשריים:
- אוטומציות (למשל: "אתה מעתיק את אותו טקסט 5 פעמים ביום — רוצה שאיצור קיצור?")
- חיסכון בסוללה (למשל: "אפליקציה X שולחת 40 התראות ביום — כדאי להשתיק")
- ארגון (למשל: "קבצים חדשים מתפזרים — רוצה שאארגן לפי תאריך?")
- שיפור ביצועים (למשל: "הזיכרון תמיד מלא — כדאי לסגור אפליקציות ברקע")
- נוהלי עבודה (למשל: "אתה תמיד עובד על אותם קבצים — רוצה שאיצור פרויקט?")

כללים:
- כתוב בעברית
- תהיה ספציפי (השתמש בנתונים אמיתיים)
- אל תהיה מעצבן — רק הצעות שימושיות באמת
- פורמט: JSON array של אובייקטים עם { "emoji", "title", "description", "actionable": true/false }`;

export interface Suggestion {
  emoji: string;
  title: string;
  description: string;
  actionable: boolean;
}

export async function generateDigest(
  analysis: AnalysisResult,
  apiKey: string
): Promise<Suggestion[]> {
  const client = new Anthropic({ apiKey });

  const statsText = `
סיכום יומי:
- מספר דגימות: ${analysis.stats.totalSnapshots}
- סוללה ממוצעת: ${analysis.stats.avgBattery}%
- קצב ריקון סוללה: ${analysis.stats.batteryDrainRate}%/שעה
- זיכרון ממוצע: ${analysis.stats.avgMemory}%
- אפליקציות שהכי שלחו התראות: ${analysis.stats.topNotificationApps.map(a => `${a.app}(${a.count})`).join(', ') || 'אין'}
- טקסטים שהועתקו כמה פעמים: ${analysis.stats.clipboardRepetitions.map(c => `"${c.text.substring(0, 30)}"(${c.count}x)`).join(', ') || 'אין'}
- קבצים שנערכו לעיתים קרובות: ${analysis.stats.frequentFiles.map(f => `${f.name}(${f.count}x)`).join(', ') || 'אין'}
- תבניות שזוהו: ${analysis.patterns.map(p => p.description).join('; ') || 'אין'}
`.trim();

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Cheapest model for background analysis
      max_tokens: 1024,
      system: DIGEST_PROMPT,
      messages: [{ role: 'user', content: statsText }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as Suggestion[];
    }

    return [{
      emoji: '📊',
      title: 'סיכום יומי',
      description: text.substring(0, 200),
      actionable: false,
    }];
  } catch (err) {
    console.error('[Digest] Error:', (err as Error).message);
    return [];
  }
}
