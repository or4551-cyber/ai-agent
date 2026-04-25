'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getBriefing, getSuggestions, triggerDigest, Suggestion,
  getReminders, completeReminder, addReminder, Reminder,
  getObserverStatus, getUserProfile, UserProfile,
  getAlerts, markAllAlertsRead, SmartAlert
} from '@/lib/api';
import {
  Battery, BatteryCharging, Loader2, MessageSquare,
  Lightbulb, Sparkles, Eye, CheckCircle2, Circle,
  Plus, Bell, Cloud, Cpu, ChevronRight, RefreshCw,
  Camera, Search, FolderOpen, Brain, TrendingUp, Zap, AlertCircle, HardDrive, Settings
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ALERT_TYPE_COMMANDS: Record<string, string> = {
  battery_low: 'מה שורף לי סוללה? תן לי המלצות לחיסכון',
  battery_full: 'הסוללה מלאה, תראה לי סטטוס סוללה',
  storage_low: 'תסרוק את האחסון ותציע מה למחוק',
  notification_spam: 'תראה לי התראות ספאם ותעזור לי להשתיק',
  memory_high: 'הזיכרון גבוה, מה אפשר לסגור?',
  wellbeing_check: 'איך אני מבחינת בריאות? תבדוק דופק, תנועה ורמת לחץ',
  health_alert: 'תראה לי את נתוני הבריאות שלי ותנתח אותם',
  sedentary_alert: 'אני יושב יותר מדי, תציע לי פעילות קצרה',
};

export default function DashboardPage() {
  const router = useRouter();
  const [briefing, setBriefing] = useState<Record<string, unknown> | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [observerStatus, setObserverStatus] = useState<Record<string, unknown> | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [showAlerts, setShowAlerts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [newReminder, setNewReminder] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [b, r, s, obs, prof, al] = await Promise.all([
        getBriefing().catch(() => null),
        getReminders().catch(() => ({ reminders: [] })),
        getSuggestions().catch(() => ({ suggestions: [] })),
        getObserverStatus().catch(() => null),
        getUserProfile().catch(() => null),
        getAlerts().catch(() => ({ alerts: [], unreadCount: 0 })),
      ]);
      setBriefing(b);
      setReminders(r.reminders);
      setSuggestions(s.suggestions);
      setObserverStatus(obs);
      setProfile(prof);
      setAlerts(al.alerts);
      setUnreadAlerts(al.unreadCount);
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
      <div className="px-5 pt-5 pb-4 bg-gradient-to-b from-[var(--primary)]/10 to-transparent relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-3xl font-bold tracking-tight">{time}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts && unreadAlerts > 0) { markAllAlertsRead(); setUnreadAlerts(0); } }}
              className="relative p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            >
              <Bell size={16} />
              {unreadAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadAlerts}
                </span>
              )}
            </button>
            <button
              onClick={() => load(true)}
              className="p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <Link href="/settings" className="p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Settings size={16} />
            </Link>
          </div>
        </div>
        <div className="text-sm text-[var(--muted-foreground)]">{greeting} &middot; {date}</div>

        {/* Alerts dropdown */}
        {showAlerts && alerts.length > 0 && (
          <div className="absolute top-16 left-4 right-4 z-50 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl max-h-64 overflow-y-auto animate-fade-in">
            <div className="p-3 border-b border-[var(--border)] text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle size={13} /> התראות חכמות
            </div>
            {alerts.slice(0, 8).map(a => (
              <button
                key={a.id}
                onClick={() => {
                  const cmd = ALERT_TYPE_COMMANDS[a.type] || `${a.title} — ${a.message}`;
                  sessionStorage.setItem('pending_command', cmd);
                  router.push('/chat');
                }}
                className={`w-full text-right px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors cursor-pointer ${!a.read ? 'bg-[var(--primary)]/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">{a.title}</div>
                  <ChevronRight size={12} className="text-[var(--muted-foreground)] opacity-50" />
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{a.message}</div>
              </button>
            ))}
          </div>
        )}
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
              <span className="text-[10px] text-[var(--muted-foreground)] flex items-center gap-1" title={`חלון: ${observerStatus.snapshotCount}/${observerStatus.bufferMax || 576} | סה"כ: ${observerStatus.totalCollected || 0} | ${observerStatus.lastSnapshotAge || 'לא זמין'}`}>
                <Eye size={10} className={observerStatus.running ? 'text-green-400' : 'text-red-400'} />
                {(observerStatus.totalCollected as number) || (observerStatus.snapshotCount as number) || 0}
                {observerStatus.lastSnapshotAge ? <span className="text-zinc-600">({String(observerStatus.lastSnapshotAge)})</span> : null}
              </span>
            )}
            <button
              onClick={async () => {
                setDigestLoading(true);
                try {
                  const r = await triggerDigest();
                  if (r.suggestions && r.suggestions.length > 0) {
                    setSuggestions(r.suggestions);
                  } else if (r.error) {
                    setSuggestions([{ emoji: '⚠️', title: 'שגיאה בניתוח', description: r.error, actionable: false }]);
                  } else {
                    setSuggestions([{ emoji: '🤷', title: 'לא נמצאו תובנות חדשות', description: 'הצופה ניתח את הנתונים אבל לא זיהה דפוסים מעניינים כרגע. נסה שוב מאוחר יותר.', actionable: false }]);
                  }
                } catch (err: any) {
                  setSuggestions([{ emoji: '⚠️', title: 'שגיאה', description: err?.message || 'הצופה לא פעיל. ודא ש-ANTHROPIC_API_KEY מוגדר ב-.env', actionable: false }]);
                } finally { setDigestLoading(false); }
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
              <button
                key={i}
                onClick={() => {
                  if (s.actionable) {
                    sessionStorage.setItem('pending_command', s.description);
                    router.push('/chat');
                  }
                }}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-right ${s.actionable ? 'hover:bg-[var(--muted)] cursor-pointer active:scale-[0.98] transition-all' : ''}`}
              >
                <span className="text-base mt-0.5">{s.emoji}</span>
                <div className="flex-1">
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{s.description}</div>
                </div>
                {s.actionable && <ChevronRight size={14} className="text-[var(--muted-foreground)] opacity-40 mt-1 shrink-0" />}
              </button>
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
        <div className="grid grid-cols-4 gap-2">
          <Link href="/" className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <MessageSquare size={20} className="text-[var(--primary)]" />
            <span className="text-[10px] font-medium">צ'אט</span>
          </Link>
          <Link href="/files" className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <FolderOpen size={20} className="text-purple-400" />
            <span className="text-[10px] font-medium">קבצים</span>
          </Link>
          <Link href="/gallery" className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <Camera size={20} className="text-emerald-400" />
            <span className="text-[10px] font-medium">גלריה</span>
          </Link>
          <Link href="/storage" className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] active:scale-95 transition-all">
            <HardDrive size={20} className="text-amber-400" />
            <span className="text-[10px] font-medium">אחסון</span>
          </Link>
          <Link href="/capabilities" className="col-span-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 active:scale-[0.98] transition-all">
            <Sparkles size={15} className="text-purple-400" />
            <span className="text-[11px] font-medium text-purple-400">מה אני יכול לעשות? — כל היכולות</span>
          </Link>
        </div>
      </div>

      {/* AI Learning Stats */}
      {profile && (profile.totalConversations > 0 || profile.topTools.length > 0) && (
        <div className="px-4 pb-6">
          <h2 className="text-xs font-semibold text-[var(--muted-foreground)] mb-2 tracking-wider flex items-center gap-1.5">
            <Brain size={13} /> למידה מצטברת
          </h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
              <div className="p-3 text-center">
                <div className="text-lg font-bold">{profile.totalConversations}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">שיחות</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-lg font-bold">{profile.totalMessages}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">הודעות</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-lg font-bold">{profile.topTopics.length}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">נושאים</div>
              </div>
            </div>

            {/* Top topics */}
            {profile.topTopics.length > 0 && (
              <div className="p-3 border-b border-[var(--border)]">
                <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <TrendingUp size={10} /> נושאים עיקריים
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.topTopics.slice(0, 6).map((t) => (
                    <span key={t.topic} className="px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] font-medium">
                      {t.topic} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top tools */}
            {profile.topTools.length > 0 && (
              <div className="p-3 border-b border-[var(--border)]">
                <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <Zap size={10} /> כלים שנמצאים בשימוש
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.topTools.slice(0, 6).map((t) => (
                    <span key={t.tool} className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-medium">
                      {t.tool} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Learned preferences */}
            {profile.preferences.length > 0 && (
              <div className="p-3">
                <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">העדפות שנלמדו</div>
                <div className="space-y-1">
                  {profile.preferences.slice(0, 4).map((p) => (
                    <div key={p.key} className="text-[11px] flex items-start gap-1.5">
                      <span className="text-emerald-400">•</span>
                      <span><strong>{p.key}:</strong> {p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
