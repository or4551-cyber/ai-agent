'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getBriefing, getSuggestions, triggerDigest, Suggestion,
  getReminders, completeReminder, addReminder, Reminder,
  getObserverStatus
} from '@/lib/api';
import {
  Battery, BatteryCharging, Loader2, MessageSquare,
  Lightbulb, Sparkles, Eye, CheckCircle2, Circle,
  Plus, Bell, Cloud, Cpu, ChevronRight, RefreshCw,
  Camera, Search, FolderOpen
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [briefing, setBriefing] = useState<Record<string, unknown> | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [observerStatus, setObserverStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [newReminder, setNewReminder] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [b, r, s, obs] = await Promise.all([
        getBriefing().catch(() => null),
        getReminders().catch(() => ({ reminders: [] })),
        getSuggestions().catch(() => ({ suggestions: [] })),
        getObserverStatus().catch(() => null),
      ]);
      setBriefing(b);
      setReminders(r.reminders);
      setSuggestions(s.suggestions);
      setObserverStatus(obs);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleAddReminder = async () => {
    if (!newReminder.trim()) return;
    const dueAt = new Date(Date.now() + 3600000).toISOString(); // Default: 1 hour from now
    await addReminder(newReminder.trim(), dueAt);
    setNewReminder('');
    const r = await getReminders();
    setReminders(r.reminders);
  };

  const handleComplete = async (id: string) => {
    await completeReminder(id);
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const greeting = (briefing?.greeting as string) || 'Hello';
  const time = (briefing?.time as string) || '';
  const date = (briefing?.date as string) || '';
  const battery = briefing?.battery as { percentage: number; status: string } | null;
  const weather = (briefing?.weather as string) || null;
  const memory = (briefing?.memoryUsage as number) || 0;
  const unread = (briefing?.unreadNotifications as number) || 0;
  const tip = (briefing?.tip as string) || '';

  const batteryColor = battery
    ? battery.percentage > 50 ? 'bg-emerald-400' : battery.percentage > 20 ? 'bg-amber-400' : 'bg-red-400'
    : 'bg-gray-400';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Greeting Header */}
      <div className="px-5 pt-6 pb-4 bg-gradient-to-b from-[var(--primary)]/10 to-transparent relative">
        <button
          onClick={() => load(true)}
          className="absolute top-5 left-4 p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <div className="text-3xl font-bold mb-0.5 tracking-tight">{time}</div>
        <div className="text-sm text-[var(--muted-foreground)]">{greeting} &middot; {date}</div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {/* Battery */}
        {battery && (
          <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-2">
              {battery.status === 'CHARGING' ? <BatteryCharging size={13} /> : <Battery size={13} />}
              סוללה
            </div>
            <div className="text-xl font-bold mb-1.5">{battery.percentage}%</div>
            <div className="w-full h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
              <div className={`h-full rounded-full transition-all ${batteryColor}`} style={{ width: `${battery.percentage}%` }} />
            </div>
            {battery.status === 'CHARGING' && <div className="text-[10px] text-emerald-400 mt-1">בטעינה</div>}
          </div>
        )}

        {/* Memory */}
        <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-2">
            <Cpu size={13} /> זיכרון
          </div>
          <div className="text-xl font-bold mb-1.5">{memory}%</div>
          <div className="w-full h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${memory > 85 ? 'bg-red-400' : memory > 60 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${memory}%` }} />
          </div>
        </div>

        {/* Weather */}
        {weather && (
          <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-2">
              <Cloud size={13} /> מזג אוויר
            </div>
            <div className="text-sm font-bold">{weather}</div>
          </div>
        )}

        {/* Notifications */}
        <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-2">
            <Bell size={13} /> התראות
          </div>
          <div className="text-xl font-bold">{unread}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{unread > 0 ? 'לא נקראו' : 'הכל נקרא'}</div>
        </div>
      </div>

      {/* Reminders */}
      <div className="px-4 pb-4">
        <h2 className="text-xs font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircle2 size={13} /> תזכורות
        </h2>
        {reminders.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground)] mb-2">אין תזכורות פעילות</div>
        ) : (
          <div className="space-y-1.5 mb-2">
            {reminders.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                <button onClick={() => handleComplete(r.id)} className="text-[var(--muted-foreground)] hover:text-green-400 transition-colors">
                  <Circle size={16} />
                </button>
                <span className="text-sm flex-1">{r.text}</span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {new Date(r.dueAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newReminder}
            onChange={(e) => setNewReminder(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
            placeholder="הוסף תזכורת..."
            dir="auto"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={handleAddReminder}
            disabled={!newReminder.trim()}
            className="px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-xs disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1.5">
            <Lightbulb size={13} /> תובנות AI
          </h2>
          <div className="flex items-center gap-2">
            {observerStatus && (
              <span className="text-[10px] text-[var(--muted-foreground)] flex items-center gap-1">
                <Eye size={10} /> {(observerStatus.snapshotCount as number) || 0}
              </span>
            )}
            <button
              onClick={async () => {
                setDigestLoading(true);
                try { const r = await triggerDigest(); setSuggestions(r.suggestions); }
                catch {} finally { setDigestLoading(false); }
              }}
              disabled={digestLoading}
              className="text-[10px] text-[var(--primary)] hover:underline flex items-center gap-0.5 disabled:opacity-50"
            >
              {digestLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              צור
            </button>
          </div>
        </div>
        {suggestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center text-[10px] text-[var(--muted-foreground)]">
            הצופה רץ ברקע. תובנות מופיעות ב-21:00 או לחץ צור.
          </div>
        ) : (
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <span className="text-base mt-0.5">{s.emoji}</span>
                <div>
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tip of the day */}
      {tip && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20">
          <div className="text-[10px] text-[var(--primary)] font-semibold mb-0.5">💡 טיפ</div>
          <div className="text-xs">{tip}</div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 pb-6">
        <h2 className="text-xs font-semibold text-[var(--muted-foreground)] mb-2 tracking-wider">פעולות מהירות</h2>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/" className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <MessageSquare size={20} className="text-[var(--primary)]" />
            <span className="text-[11px] font-medium">צ'אט</span>
          </Link>
          <Link href="/files" className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <FolderOpen size={20} className="text-purple-400" />
            <span className="text-[11px] font-medium">קבצים</span>
          </Link>
          <Link href="/gallery" className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <Camera size={20} className="text-emerald-400" />
            <span className="text-[11px] font-medium">גלריה</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
