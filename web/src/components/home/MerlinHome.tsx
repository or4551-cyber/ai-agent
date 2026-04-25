'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Heart, Footprints, Users, Brain, Activity, Search,
  MessageCircle, Camera, Folder, Music, Map, Phone,
  Mail, Calendar, Battery, Wifi, BellRing, Sparkles,
  ArrowRight, Mic, Sun, Moon, CloudSun, Star,
} from 'lucide-react';
import {
  getHealthStatus, getProximityStatus, getProactiveAlerts, getBriefing,
  HealthStatus, ProximityStatus, ProactiveAlert,
} from '@/lib/api';
import { showNotification } from '@/components/common/ServiceWorkerRegistration';

// ===== CLOCK =====
function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const day = dayNames[time.getDay()];
  const date = time.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });

  const hour = time.getHours();
  const greeting = hour < 6 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';
  const GreetIcon = hour < 6 ? Moon : hour < 17 ? Sun : hour < 21 ? CloudSun : Moon;

  return (
    <div className="text-center py-6">
      <div className="text-6xl font-extralight tracking-wider text-white tabular-nums">
        {hours}:{minutes}
      </div>
      <div className="mt-2 text-sm text-zinc-400 flex items-center justify-center gap-2">
        <GreetIcon size={14} />
        <span>{greeting} | יום {day}, {date}</span>
      </div>
    </div>
  );
}

// ===== HEALTH CARD =====
function HealthCard({ health, proximity }: { health: HealthStatus | null; proximity: ProximityStatus | null }) {
  const stressColors = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-red-400', unknown: 'text-zinc-500' };
  const stressLabels = { low: 'נמוך', medium: 'בינוני', high: 'גבוה', unknown: '—' };

  return (
    <div className="glass rounded-2xl p-4 border border-[var(--border)]">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-[var(--primary)]" />
        <span className="text-xs font-medium text-zinc-400">סטטוס בריאות</span>
        {!health?.lastReading && (
          <span className="text-[9px] text-zinc-600 mr-auto">מתחבר לשעון...</span>
        )}
        {health?.lastReading && !health?.currentHeartRate && !health?.todaySteps && (
          <span className="text-[9px] text-zinc-600 mr-auto">ממתין לנתונים מהשעון</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        {/* Heart Rate */}
        <div>
          <Heart size={18} className={`mx-auto mb-1 ${health?.isHeartRateAbnormal ? 'text-red-400 animate-pulse' : 'text-pink-400'}`} />
          <div className="text-lg font-semibold text-white">
            {health?.currentHeartRate ?? '—'}
          </div>
          <div className="text-[10px] text-zinc-500">דופק</div>
        </div>

        {/* Steps */}
        <div>
          <Footprints size={18} className="mx-auto mb-1 text-blue-400" />
          <div className="text-lg font-semibold text-white">
            {health?.todaySteps != null ? (health.todaySteps > 999 ? `${(health.todaySteps / 1000).toFixed(1)}k` : health.todaySteps) : '—'}
          </div>
          <div className="text-[10px] text-zinc-500">צעדים</div>
        </div>

        {/* Stress */}
        <div>
          <Brain size={18} className={`mx-auto mb-1 ${stressColors[health?.stressLevel || 'unknown']}`} />
          <div className={`text-lg font-semibold ${stressColors[health?.stressLevel || 'unknown']}`}>
            {stressLabels[health?.stressLevel || 'unknown']}
          </div>
          <div className="text-[10px] text-zinc-500">לחץ</div>
        </div>

        {/* Proximity */}
        <div>
          <Users size={18} className={`mx-auto mb-1 ${proximity?.isAlone ? 'text-orange-400' : 'text-green-400'}`} />
          <div className="text-lg font-semibold text-white">
            {proximity ? proximity.nearbyDeviceCount : '—'}
          </div>
          <div className="text-[10px] text-zinc-500">
            {proximity?.isAlone ? 'לבד' : 'בסביבה'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== ALERTS STRIP =====
function AlertsStrip({ alerts }: { alerts: ProactiveAlert[] }) {
  const router = useRouter();

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.slice(0, 3).map((alert) => (
        <button
          key={alert.id}
          onClick={() => router.push('/chat')}
          className="glass rounded-xl px-4 py-3 border border-[var(--border)] flex items-center gap-3 text-right w-full hover:bg-[var(--muted)] active:scale-[0.98] transition-all"
        >
          <span className="text-xl shrink-0">{alert.icon}</span>
          <span className="text-sm text-zinc-300 flex-1 truncate">{alert.text}</span>
          <ArrowRight size={14} className="text-zinc-600 shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ===== QUICK APPS GRID =====
function QuickApps() {
  const router = useRouter();

  const apps = [
    { icon: MessageCircle, label: 'צ\'אט', color: 'from-violet-500 to-purple-600', action: () => router.push('/chat') },
    { icon: Camera, label: 'מצלמה', color: 'from-pink-500 to-rose-600', action: () => router.push('/chat?cmd=צלם+תמונה') },
    { icon: Phone, label: 'שיחה', color: 'from-green-500 to-emerald-600', action: () => router.push('/chat?cmd=חייג') },
    { icon: Mail, label: 'מייל', color: 'from-blue-500 to-cyan-600', action: () => router.push('/chat?cmd=תראה+מיילים+חדשים') },
    { icon: Calendar, label: 'יומן', color: 'from-orange-500 to-amber-600', action: () => router.push('/chat?cmd=מה+ביומן+היום') },
    { icon: Music, label: 'מוזיקה', color: 'from-teal-500 to-green-600', action: () => router.push('/chat?cmd=מה+מתנגן+עכשיו') },
    { icon: Map, label: 'מיקום', color: 'from-indigo-500 to-blue-600', action: () => router.push('/chat?cmd=איפה+אני+עכשיו') },
    { icon: Folder, label: 'קבצים', color: 'from-zinc-500 to-zinc-600', action: () => router.push('/files') },
    { icon: Star, label: 'מועדפים', color: 'from-amber-500 to-yellow-600', action: () => router.push('/favorites') },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {apps.map((app) => {
        const Icon = app.icon;
        return (
          <button
            key={app.label}
            onClick={app.action}
            className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center shadow-lg`}>
              <Icon size={22} className="text-white" />
            </div>
            <span className="text-[11px] text-zinc-400">{app.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ===== SEARCH BAR =====
function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!query.trim()) return;
    router.push(`/chat?cmd=${encodeURIComponent(query.trim())}`);
    setQuery('');
  };

  return (
    <div className="glass rounded-2xl border border-[var(--border)] flex items-center gap-2 px-4 py-3">
      <Search size={18} className="text-zinc-500 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="שאל את Merlin כל דבר..."
        className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
        dir="auto"
      />
      <button
        onClick={() => router.push('/live')}
        className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center hover:bg-[var(--primary)]/30 transition-colors"
      >
        <Mic size={16} className="text-[var(--primary)]" />
      </button>
    </div>
  );
}

// ===== MERLIN BRANDING =====
function MerlinBrand() {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <Sparkles size={14} className="text-[var(--primary)]" />
      <span className="text-xs text-zinc-600 font-medium tracking-widest uppercase">Merlin</span>
      <Sparkles size={14} className="text-[var(--primary)]" />
    </div>
  );
}

// ===== MAIN HOME SCREEN =====
export default function MerlinHome() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [proximity, setProximity] = useState<ProximityStatus | null>(null);
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [h, p, a] = await Promise.allSettled([
          getHealthStatus(),
          getProximityStatus(),
          getProactiveAlerts(),
        ]);
        if (h.status === 'fulfilled') setHealth(h.value);
        if (p.status === 'fulfilled') setProximity(p.value);
        if (a.status === 'fulfilled') {
          const newAlerts = a.value.alerts || [];
          // Push notification for new high-priority alerts
          if (newAlerts.length > 0 && document.hidden) {
            const high = newAlerts.find((al: ProactiveAlert) => al.priority === 'high');
            if (high) showNotification('Merlin', high.text, '/chat');
          }
          setAlerts(newAlerts);
        }
      } catch {}
    };

    load();
    const interval = setInterval(load, 30000); // Refresh every 30 sec
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="flex flex-col gap-5 p-4 pb-24 max-w-lg mx-auto w-full">
        {/* Clock + Greeting */}
        <Clock />

        {/* Search bar */}
        <SearchBar />

        {/* Health & Proximity */}
        <HealthCard health={health} proximity={proximity} />

        {/* Proactive Alerts */}
        <AlertsStrip alerts={alerts} />

        {/* Quick Apps */}
        <div>
          <div className="text-xs text-zinc-500 font-medium mb-3 px-1">גישה מהירה</div>
          <QuickApps />
        </div>

        {/* Branding */}
        <MerlinBrand />
      </div>
    </div>
  );
}
