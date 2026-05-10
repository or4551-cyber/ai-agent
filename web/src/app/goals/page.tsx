'use client';

import { useEffect, useState } from 'react';
import { Compass, Pause, Play, Check, Trash2, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import {
  listGoals, createGoal, pauseGoal, resumeGoal, completeGoal, deleteGoal,
  type Goal,
} from '@/lib/api';

const STATUS_LABEL: Record<Goal['status'], string> = {
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושג',
  failed: 'נכשל',
};

const STATUS_COLOR: Record<Goal['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  paused: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  completed: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const NOTIFY_LABEL: Record<Goal['notifyOn'], string> = {
  always: 'תמיד',
  change: 'רק כששינוי',
  completion: 'רק בסיום',
};

function formatInterval(min: number): string {
  if (min < 60) return `כל ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 24) return `כל ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'יומי' : `כל ${d} ימים`;
}

function relativeTime(ts?: number): string {
  if (!ts) return 'טרם';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'הרגע';
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.floor(min / 60);
  if (h < 24) return `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const r = await listGoals(includeCompleted);
      setGoals(r.goals);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeCompleted]);

  const handleAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-24">
      <header className="flex items-center justify-between mb-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          <Compass size={22} className="text-cyan-400" />
          <h1 className="text-xl font-semibold">מטרות</h1>
          <span className="text-sm text-zinc-500">({goals.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            aria-label="רענן"
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowNew((s) => !s)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
          >
            <Plus size={14} /> מטרה חדשה
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto">
        <label className="flex items-center gap-2 mb-3 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => setIncludeCompleted(e.target.checked)}
            className="accent-cyan-500"
          />
          הצג גם הושגו/נכשלו
        </label>

        {showNew && (
          <NewGoalForm
            onCreate={async (input) => {
              await handleAction(() => createGoal(input));
              setShowNew(false);
            }}
            onCancel={() => setShowNew(false)}
          />
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div className="text-zinc-500 text-center py-8">טוען...</div>
        ) : goals.length === 0 ? (
          <div className="text-zinc-500 text-center py-12">
            אין מטרות עדיין. <button onClick={() => setShowNew(true)} className="text-cyan-400 hover:underline">צור אחת</button> או בקש ממרלין בצ&apos;אט.
          </div>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => (
              <li
                key={g.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[g.status]}`}
                  >
                    {STATUS_LABEL[g.status]}
                  </span>
                  <div className="flex gap-1">
                    {g.status === 'active' && (
                      <button
                        onClick={() => handleAction(() => pauseGoal(g.id))}
                        title="השהה"
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    {g.status === 'paused' && (
                      <button
                        onClick={() => handleAction(() => resumeGoal(g.id))}
                        title="המשך"
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                      >
                        <Play size={14} />
                      </button>
                    )}
                    {(g.status === 'active' || g.status === 'paused') && (
                      <button
                        onClick={() => handleAction(() => completeGoal(g.id))}
                        title="סמן כהושג"
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('למחוק את המטרה הזו?')) handleAction(() => deleteGoal(g.id));
                      }}
                      title="מחק"
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-medium mb-1" dir="auto">{g.description}</p>
                {g.successCriteria && (
                  <p className="text-xs text-zinc-400 mb-2" dir="auto">
                    <span className="text-zinc-500">קריטריון: </span>{g.successCriteria}
                  </p>
                )}
                <div className="text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{formatInterval(g.checkIntervalMinutes)}</span>
                  <span>· התראה: {NOTIFY_LABEL[g.notifyOn]}</span>
                  <span>· {g.checks} בדיקות</span>
                  <span>· {g.notifications} התראות</span>
                  <span>· אחרון: {relativeTime(g.lastCheckedAt)}</span>
                </div>
                {g.lastSummary && (
                  <div className="mt-2 text-xs text-zinc-300 bg-zinc-950 rounded p-2 border border-zinc-800" dir="auto">
                    📝 {g.lastSummary}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewGoalForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { description: string; success_criteria?: string; check_interval_minutes?: number; notify_on?: 'always' | 'change' | 'completion' }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [intervalHours, setIntervalHours] = useState(24);
  const [notifyOn, setNotifyOn] = useState<'always' | 'change' | 'completion'>('change');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!description.trim()) return;
        onCreate({
          description: description.trim(),
          success_criteria: criteria.trim() || undefined,
          check_interval_minutes: Math.max(intervalHours, 1) * 60,
          notify_on: notifyOn,
        });
      }}
      className="mb-4 bg-zinc-900 border border-cyan-500/30 rounded-xl p-3 space-y-3"
    >
      <div>
        <label className="block text-xs text-zinc-400 mb-1">מה לעקוב?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="לדוגמה: תזהה אם יש לי משימות שעבר זמנן ותגיד לי"
          rows={2}
          dir="auto"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          required
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">קריטריון הצלחה (אופציונלי)</label>
        <input
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="איך נדע שהשגנו?"
          dir="auto"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תדירות (שעות)</label>
          <input
            type="number"
            min={1}
            max={720}
            value={intervalHours}
            onChange={(e) => setIntervalHours(parseInt(e.target.value) || 24)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">התראה</label>
          <select
            value={notifyOn}
            onChange={(e) => setNotifyOn(e.target.value as 'always' | 'change' | 'completion')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="change">רק כששינוי</option>
            <option value="always">תמיד</option>
            <option value="completion">רק בסיום</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 text-sm">
          ביטול
        </button>
        <button type="submit" className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium">
          צור מטרה
        </button>
      </div>
    </form>
  );
}
