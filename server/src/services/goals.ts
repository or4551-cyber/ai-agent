// Goals service — Merlin's first step toward proactive autonomy.
//
// A Goal is a long-running intent the user has handed off:
//   - "תעדכן אותי כשטיסה לאתונה יורדת מ-1500₪"
//   - "פעם בשבוע תסכם לי מה התוכן הפוליטי שצרכתי"
//   - "תוודא שגיבוי רץ כל לילה"
//
// Lifecycle:
//   1. user creates a goal via goal_add (or Merlin proposes one and they confirm)
//   2. background loop wakes every minute, finds goals due for a check
//   3. for each due goal: spawn a small Claude Haiku call with web tools and
//      a "checker" prompt that asks: did anything change? is the goal met?
//   4. if there's a notable update, emit a proactive notification (re-using
//      the same channel the proactive-agent uses, so it flows to UI + WS)
//   5. on goal_complete or auto-completion, mark done and stop checking
//
// Persistence: ~/.ai-agent/goals.json. Survives restarts (tied into the
// supervisor's graceful drain via the existing fs.writeFileSync model).

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

const HOME = process.env.HOME || '.';
const GOALS_FILE = path.join(HOME, '.ai-agent', 'goals.json');
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed';
export type NotifyPolicy = 'always' | 'change' | 'completion';

export interface Goal {
  id: string;
  description: string;
  successCriteria?: string;
  checkIntervalMinutes: number;
  notifyOn: NotifyPolicy;
  status: GoalStatus;
  createdAt: number;
  lastCheckedAt?: number;
  lastSummary?: string;
  lastChangeAt?: number;
  checks: number;
  notifications: number;
}

export interface GoalCheckResult {
  status: 'no_change' | 'update' | 'met' | 'failed';
  summary: string;
  shouldNotify: boolean;
  notificationMessage?: string;
}

const CHECKER_PROMPT = `אתה Goal Checker — שירות רקע של מרלין שבודק האם מטרה ארוכת טווח קודמה.
תקבל תיאור מטרה, קריטריוני הצלחה, וסיכום של הבדיקה הקודמת (אם הייתה).
המטרה שלך: לקבוע מה השתנה ולהחליט האם להתריע למשתמש.

## כללים
- היה תמציתי. כתוב summary של 1-2 משפטים.
- אם אתה לא בטוח — status="no_change", shouldNotify=false.
- "met" רק אם הקריטריון הושג חד משמעית.
- "failed" רק אם הוכח שלא ניתן להגיע לקריטריון.
- shouldNotify=true רק אם יש משהו ששווה להעיר עליו עכשיו.

## פלט
החזר JSON בפורמט הבא בלבד (בלי טקסט נוסף):
{
  "status": "no_change" | "update" | "met" | "failed",
  "summary": "תיאור קצר בעברית של מה שנמצא",
  "shouldNotify": true | false,
  "notificationMessage": "הודעת ההתראה למשתמש (אם shouldNotify=true)"
}`;

type NotifyHandler = (goal: Goal, result: GoalCheckResult) => void;

export class GoalsService {
  private goals: Map<string, Goal> = new Map();
  private apiKey: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notify: NotifyHandler | null = null;
  private inflightChecks = new Set<string>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(GOALS_FILE)) return;
      const arr = JSON.parse(fs.readFileSync(GOALS_FILE, 'utf-8')) as Goal[];
      for (const g of arr) this.goals.set(g.id, g);
      console.log(`[Goals] Loaded ${this.goals.size} goals`);
    } catch (err) {
      console.error('[Goals] Load failed:', (err as Error).message);
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(GOALS_FILE), { recursive: true });
      const tmp = GOALS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify([...this.goals.values()], null, 2));
      fs.renameSync(tmp, GOALS_FILE);
    } catch (err) {
      console.error('[Goals] Save failed:', (err as Error).message);
    }
  }

  setNotifyHandler(h: NotifyHandler): void {
    this.notify = h;
  }

  start(): void {
    if (this.timer) return;
    if (!this.apiKey) {
      // Without an API key the checker can't call Anthropic. Don't burn CPU
      // ticking forever and emitting silent 401s — start in a paused state.
      console.warn('[Goals] No ANTHROPIC_API_KEY — checker loop NOT started. CRUD still works.');
      return;
    }
    // Run once shortly after boot, then every minute. Goals with longer
    // intervals are skipped on each tick if not due — cheap.
    this.timer = setInterval(() => this.tick().catch(() => {}), 60_000);
    this.timer.unref?.();
    const warm = setTimeout(() => this.tick().catch(() => {}), 30_000);
    warm.unref?.();
    console.log('[Goals] Started (check loop: 60s tick, per-goal interval respected)');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ===== CRUD =====

  add(input: {
    description: string;
    successCriteria?: string;
    checkIntervalMinutes?: number;
    notifyOn?: NotifyPolicy;
  }): Goal {
    // Default: check daily. Below 30min isn't useful (and burns tokens).
    // Reject NaN, Infinity, negative values by falling back to default —
    // otherwise the checker comparison `now - lastCheckedAt >= NaN` is always
    // false and the goal would never fire.
    const requested = input.checkIntervalMinutes;
    const interval = (typeof requested === 'number' && Number.isFinite(requested) && requested > 0)
      ? Math.max(Math.floor(requested), 30)
      : 1440;

    const goal: Goal = {
      id: `goal-${Date.now()}-${uuidv4().slice(0, 6)}`,
      description: input.description,
      successCriteria: input.successCriteria,
      checkIntervalMinutes: interval,
      notifyOn: input.notifyOn ?? 'change',
      status: 'active',
      createdAt: Date.now(),
      checks: 0,
      notifications: 0,
    };
    this.goals.set(goal.id, goal);
    this.save();
    return goal;
  }

  list(includeCompleted = false): Goal[] {
    const arr = [...this.goals.values()];
    return arr
      .filter((g) => includeCompleted || g.status === 'active' || g.status === 'paused')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  pause(id: string): boolean {
    const g = this.goals.get(id);
    if (!g) return false;
    g.status = 'paused';
    this.save();
    return true;
  }

  resume(id: string): boolean {
    const g = this.goals.get(id);
    if (!g || g.status === 'completed') return false;
    g.status = 'active';
    this.save();
    return true;
  }

  complete(id: string, summary?: string): boolean {
    const g = this.goals.get(id);
    if (!g) return false;
    g.status = 'completed';
    if (summary) g.lastSummary = summary;
    this.save();
    return true;
  }

  delete(id: string): boolean {
    const ok = this.goals.delete(id);
    if (ok) this.save();
    return ok;
  }

  // ===== CHECKER LOOP =====

  private async tick(): Promise<void> {
    const now = Date.now();
    const due = [...this.goals.values()].filter((g) => {
      if (g.status !== 'active') return false;
      if (this.inflightChecks.has(g.id)) return false;
      if (!g.lastCheckedAt) return true;
      return now - g.lastCheckedAt >= g.checkIntervalMinutes * 60_000;
    });

    if (due.length === 0) return;
    console.log(`[Goals] ${due.length} goal(s) due for check`);

    // Check sequentially to avoid hammering Anthropic with concurrent requests
    // and to keep token spend predictable.
    for (const goal of due) {
      this.inflightChecks.add(goal.id);
      try {
        await this.checkGoal(goal);
      } catch (err) {
        console.error(`[Goals] Check failed for ${goal.id}:`, (err as Error).message);
      } finally {
        this.inflightChecks.delete(goal.id);
      }
    }
  }

  private async checkGoal(goal: Goal): Promise<void> {
    // ALWAYS stamp lastCheckedAt + checks++ at the start. If the call
    // (or the JSON parse) crashes, we don't want to retry on the next 60s
    // tick — that would mean a hot loop spending tokens on a broken goal.
    // Honor the goal's interval even when the check fails.
    goal.lastCheckedAt = Date.now();
    goal.checks++;
    this.save();

    const client = new Anthropic({ apiKey: this.apiKey });

    const userMessage = [
      `## מטרה`,
      goal.description,
      goal.successCriteria ? `\n## קריטריון הצלחה\n${goal.successCriteria}` : '',
      goal.lastSummary ? `\n## בדיקה קודמת\n${goal.lastSummary}` : '\n## בדיקה ראשונה',
      `\n## עכשיו\n${new Date().toLocaleString('he-IL')}`,
      `\n## התשובה שלך`,
      `החזר JSON בפורמט שצוין במערכת. אם אתה לא בטוח, status="no_change".`,
    ].filter(Boolean).join('\n');

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: CHECKER_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    let result: GoalCheckResult;
    try {
      result = JSON.parse(jsonMatch[0]) as GoalCheckResult;
    } catch (err) {
      console.error(`[Goals] Bad JSON from checker for ${goal.id}: ${(err as Error).message}`);
      return;
    }

    goal.lastSummary = result.summary;

    if (result.status === 'met') {
      goal.status = 'completed';
      goal.lastChangeAt = Date.now();
    } else if (result.status === 'failed') {
      goal.status = 'failed';
      goal.lastChangeAt = Date.now();
    } else if (result.status === 'update') {
      goal.lastChangeAt = Date.now();
    }

    // Decide whether to notify based on policy.
    let actuallyNotify = false;
    if (goal.notifyOn === 'always') actuallyNotify = result.shouldNotify;
    else if (goal.notifyOn === 'change') actuallyNotify = result.status !== 'no_change' && result.shouldNotify;
    else if (goal.notifyOn === 'completion') actuallyNotify = result.status === 'met' || result.status === 'failed';

    if (actuallyNotify && this.notify) {
      try {
        this.notify(goal, result);
        goal.notifications++;
      } catch (err) {
        console.error('[Goals] notify handler failed:', (err as Error).message);
      }
    }

    this.save();
  }
}
