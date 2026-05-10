'use client';

import { useEffect, useState } from 'react';
import { Shield, RefreshCw, Check, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { listAudit, type AuditEntry } from '@/lib/api';

const DANGER_COLOR: Record<AuditEntry['dangerLevel'], string> = {
  safe: 'bg-zinc-700 text-zinc-300',
  moderate: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  dangerous: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

const DANGER_LABEL: Record<AuditEntry['dangerLevel'], string> = {
  safe: 'בטוח',
  moderate: 'בינוני',
  dangerous: 'מסוכן',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'dangerous' | 'errors'>('all');

  const load = async () => {
    setError(null);
    try {
      const r = await listAudit(200);
      setEntries(r.entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const filtered = entries.filter((e) => {
    if (filter === 'dangerous') return e.dangerLevel === 'dangerous';
    if (filter === 'errors') return e.outcome === 'error';
    return true;
  });

  const stats = {
    total: entries.length,
    dangerous: entries.filter((e) => e.dangerLevel === 'dangerous').length,
    errors: entries.filter((e) => e.outcome === 'error').length,
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-24">
      <header className="flex items-center justify-between mb-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          <Shield size={22} className="text-amber-400" />
          <h1 className="text-xl font-semibold">יומן פעולות</h1>
          <span className="text-sm text-zinc-500">({stats.total})</span>
        </div>
        <button
          onClick={() => load()}
          aria-label="רענן"
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-zinc-500 mb-3">
          כל פעולה מסוכנת או בינונית שמרלין ביצע. כלי בטוח (כמו קריאת קובץ) לא נרשם.
        </p>

        <div className="flex gap-2 mb-4 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full border ${
              filter === 'all' ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            הכל ({stats.total})
          </button>
          <button
            onClick={() => setFilter('dangerous')}
            className={`px-3 py-1.5 rounded-full border ${
              filter === 'dangerous' ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            🔴 מסוכנות ({stats.dangerous})
          </button>
          <button
            onClick={() => setFilter('errors')}
            className={`px-3 py-1.5 rounded-full border ${
              filter === 'errors' ? 'bg-amber-600 border-amber-500 text-white' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            ⚠️ שגיאות ({stats.errors})
          </button>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div className="text-zinc-500 text-center py-8">טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-center py-12">
            אין רשומות עדיין.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((e, i) => {
              const isExpanded = expanded.has(i);
              return (
                <li key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggle(i)}
                    className="w-full text-right p-3 flex items-center gap-2 hover:bg-zinc-800/50 transition"
                  >
                    <span className={`text-[11px] px-2 py-0.5 rounded ${DANGER_COLOR[e.dangerLevel]}`}>
                      {DANGER_LABEL[e.dangerLevel]}
                    </span>
                    {e.outcome === 'success' ? (
                      <Check size={14} className="text-emerald-400 shrink-0" />
                    ) : (
                      <X size={14} className="text-red-400 shrink-0" />
                    )}
                    <span className="font-mono text-sm font-medium" dir="ltr">
                      {e.toolName}
                    </span>
                    <span className="flex-1 text-xs text-zinc-500 text-left" dir="ltr">
                      {formatTime(e.ts)} · {formatDuration(e.durationMs)}
                      {e.approved ? '' : ' · ללא אישור'}
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 text-xs border-t border-zinc-800 pt-3">
                      <div>
                        <div className="text-zinc-500 mb-1">קלט</div>
                        <pre className="bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">
                          {e.inputPreview}
                        </pre>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">תוצאה</div>
                        <pre className="bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">
                          {e.outputPreview}
                        </pre>
                      </div>
                      {e.errorMsg && (
                        <div>
                          <div className="text-red-400 mb-1">שגיאה</div>
                          <pre className="bg-red-500/10 border border-red-500/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-red-200" dir="ltr">
                            {e.errorMsg}
                          </pre>
                        </div>
                      )}
                      {e.conversationId && (
                        <div className="text-zinc-500 text-[11px]" dir="ltr">
                          conv: {e.conversationId}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
