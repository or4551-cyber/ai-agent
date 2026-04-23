'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Battery, BatteryCharging, Wifi, WifiOff, Bluetooth, BluetoothOff,
  Flashlight, Sun, Volume2, VolumeX, BellOff, Bell,
  Smartphone, HardDrive,
  Play, Pause, SkipForward, SkipBack, Music,
  RefreshCw, ChevronLeft, Phone, ScreenShare,
} from 'lucide-react';
import Link from 'next/link';

interface DeviceStats {
  battery: { level: number; charging: boolean; temperature?: number };
  storage: { usedMb: number; totalMb: number; freeMb: number };
  volume: number;
  brightness: number;
  wifi: boolean;
  bluetooth: boolean;
  flashlight: boolean;
}

const DEFAULT_STATS: DeviceStats = {
  battery: { level: -1, charging: false },
  storage: { usedMb: 0, totalMb: 0, freeMb: 0 },
  volume: 7,
  brightness: 50,
  wifi: true,
  bluetooth: false,
  flashlight: false,
};

function getWsBaseUrl() {
  if (typeof window === 'undefined') return '';
  return process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.host}`;
}

export default function DevicePage() {
  const [stats, setStats] = useState<DeviceStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [silentMode, setSilentMode] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const base = getWsBaseUrl();
      const token = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';
      const res = await fetch(`${base}/api/device-stats?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch device stats:', e);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    setTimeout(() => setAnimateIn(true), 50);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const sendAction = async (action: string) => {
    setActionLoading(action);
    try {
      const base = getWsBaseUrl();
      const token = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';
      const res = await fetch(`${base}/api/device-action?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.message) {
          setActionFeedback(data.message);
          setTimeout(() => setActionFeedback(null), 2000);
        }
      }
      setTimeout(fetchStats, 800);
    } catch (e) {
      setActionFeedback('שגיאה בביצוע הפעולה');
      setTimeout(() => setActionFeedback(null), 2000);
    } finally {
      setActionLoading(null);
    }
  };

  const batteryLevel = stats.battery.level >= 0 ? stats.battery.level : 75;
  const batteryColor = batteryLevel > 50 ? '#34d399' : batteryLevel > 20 ? '#fbbf24' : '#f87171';
  const storagePercent = stats.storage.totalMb > 0
    ? Math.round((stats.storage.usedMb / stats.storage.totalMb) * 100)
    : 0;
  const storageColor = storagePercent > 85 ? '#f87171' : storagePercent > 60 ? '#fbbf24' : '#818cf8';

  // SVG battery ring
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const batteryOffset = circumference - (batteryLevel / 100) * circumference;

  return (
    <div className={`flex flex-col h-full overflow-y-auto pb-4 transition-all duration-700 ${animateIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <div className="glass sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 -ml-2 rounded-xl hover:bg-[var(--muted)]">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-sm font-bold">שלט רחוק</h1>
            <p className="text-[10px] text-[var(--muted-foreground)]">
              {lastRefresh ? `עודכן ${lastRefresh.toLocaleTimeString('he-IL')}` : 'טוען...'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          className="p-2.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Toast feedback */}
      {actionFeedback && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-[var(--primary)] text-white text-sm font-medium shadow-lg shadow-[var(--primary)]/30 animate-fade-in">
          {actionFeedback}
        </div>
      )}

      <div className="px-4 py-5 space-y-5">
        {/* === Battery & Storage Row === */}
        <div className="grid grid-cols-2 gap-3">
          {/* Battery Circle */}
          <div className="relative bg-[var(--card)] rounded-3xl p-4 border border-[var(--border)] flex flex-col items-center justify-center"
               style={{ animationDelay: '100ms' }}>
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} stroke="var(--border)" strokeWidth="8" fill="none" />
                <circle
                  cx="60" cy="60" r={radius}
                  stroke={batteryColor}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={batteryOffset}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {stats.battery.charging
                  ? <BatteryCharging size={20} className="text-emerald-400 mb-1" />
                  : <Battery size={20} className="mb-1" style={{ color: batteryColor }} />}
                <span className="text-2xl font-bold" style={{ color: batteryColor }}>
                  {batteryLevel}%
                </span>
                {stats.battery.charging && (
                  <span className="text-[9px] text-emerald-400 font-medium">טוען</span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)] mt-2">סוללה</span>
          </div>

          {/* Storage */}
          <div className="bg-[var(--card)] rounded-3xl p-4 border border-[var(--border)] flex flex-col justify-between"
               style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={16} className="text-[var(--muted-foreground)]" />
              <span className="text-xs font-semibold">אחסון</span>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className="relative h-3 rounded-full bg-[var(--muted)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${storagePercent}%`, backgroundColor: storageColor }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[var(--muted-foreground)]">
                <span>{(stats.storage.usedMb / 1024).toFixed(1)}GB</span>
                <span>{(stats.storage.totalMb / 1024).toFixed(1)}GB</span>
              </div>
              <div className="text-center mt-1">
                <span className="text-lg font-bold" style={{ color: storageColor }}>{storagePercent}%</span>
                <span className="text-[10px] text-[var(--muted-foreground)] mr-1">בשימוש</span>
              </div>
            </div>
            <div className="text-center mt-1">
              <span className="text-[10px] text-emerald-400 font-medium">
                {(stats.storage.freeMb / 1024).toFixed(1)}GB פנוי
              </span>
            </div>
          </div>
        </div>

        {/* === Quick Toggles === */}
        <div className="bg-[var(--card)] rounded-3xl p-4 border border-[var(--border)]">
          <h3 className="text-xs font-semibold mb-3 text-[var(--muted-foreground)]">בקרה מהירה</h3>
          <div className="grid grid-cols-4 gap-3">
            <ToggleButton
              icon={stats.wifi ? <Wifi size={20} /> : <WifiOff size={20} />}
              label="WiFi"
              active={stats.wifi}
              color="text-blue-400"
              onClick={() => sendAction('toggle_wifi')}
            />
            <ToggleButton
              icon={stats.bluetooth ? <Bluetooth size={20} /> : <BluetoothOff size={20} />}
              label="בלוטות'"
              active={stats.bluetooth}
              color="text-indigo-400"
              onClick={() => sendAction('toggle_bluetooth')}
            />
            <ToggleButton
              icon={<Flashlight size={20} />}
              label="פנס"
              active={stats.flashlight}
              color="text-amber-400"
              onClick={() => sendAction('toggle_flashlight')}
            />
            <ToggleButton
              icon={silentMode ? <BellOff size={20} /> : <Bell size={20} />}
              label={silentMode ? 'שקט' : 'רגיל'}
              active={silentMode}
              color="text-purple-400"
              onClick={() => { setSilentMode(!silentMode); sendAction('vibrate'); }}
            />
          </div>
        </div>

        {/* === Volume & Brightness Sliders === */}
        <div className="grid grid-cols-2 gap-3">
          <SliderCard
            icon={<Volume2 size={16} />}
            label="ווליום"
            value={stats.volume}
            max={15}
            color="#818cf8"
            onUp={() => sendAction('volume_up')}
            onDown={() => sendAction('volume_down')}
          />
          <SliderCard
            icon={<Sun size={16} />}
            label="בהירות"
            value={stats.brightness}
            max={100}
            unit="%"
            color="#fbbf24"
            onUp={() => sendAction('brightness_up')}
            onDown={() => sendAction('brightness_down')}
          />
        </div>

        {/* === Media Control === */}
        <div className="bg-[var(--card)] rounded-3xl p-5 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-4">
            <Music size={16} className="text-purple-400" />
            <span className="text-xs font-semibold">מדיה</span>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => sendAction('media_previous')}
              className="p-3 rounded-2xl bg-[var(--muted)] hover:bg-[var(--border)] transition-all active:scale-90"
            >
              <SkipBack size={20} />
            </button>
            <button
              onClick={() => {
                setMediaPlaying(!mediaPlaying);
                sendAction('media_play_pause');
              }}
              className="p-5 rounded-full bg-gradient-to-br from-[var(--primary)] to-purple-600 text-white shadow-lg shadow-[var(--primary)]/30 hover:shadow-[var(--primary)]/50 transition-all active:scale-90"
            >
              {mediaPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="ml-0.5" />}
            </button>
            <button
              onClick={() => sendAction('media_next')}
              className="p-3 rounded-2xl bg-[var(--muted)] hover:bg-[var(--border)] transition-all active:scale-90"
            >
              <SkipForward size={20} />
            </button>
          </div>
        </div>

        {/* === Quick Actions Grid === */}
        <div className="bg-[var(--card)] rounded-3xl p-4 border border-[var(--border)]">
          <h3 className="text-xs font-semibold mb-3 text-[var(--muted-foreground)]">פעולות מהירות</h3>
          <div className="grid grid-cols-3 gap-2">
            <ActionButton icon={<Phone size={18} />} label="חייגן" color="text-green-400" onClick={() => sendAction('open_dialer')} />
            <ActionButton icon={<Smartphone size={18} />} label="צילום מסך" color="text-cyan-400" onClick={() => sendAction('screenshot')} />
            <ActionButton icon={<ScreenShare size={18} />} label="הקלטה" color="text-red-400" onClick={() => sendAction('screenrecord')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ icon, label, active, color, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-90 ${
        active
          ? `bg-[var(--primary)]/15 ${color}`
          : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
      }`}
    >
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  );
}

function SliderCard({ icon, label, value, max, color, unit, onUp, onDown }: {
  icon: React.ReactNode; label: string; value: number; max: number; color: string;
  unit?: string; onUp: () => void; onDown: () => void;
}) {
  const percent = Math.round((value / max) * 100);
  return (
    <div className="bg-[var(--card)] rounded-3xl p-4 border border-[var(--border)]">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-xs text-[var(--muted-foreground)] mr-auto font-mono">{value}{unit || `/${max}`}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--muted)] overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onDown} className="flex-1 py-2 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-sm font-bold transition-all active:scale-95">−</button>
        <button onClick={onUp} className="flex-1 py-2 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-sm font-bold transition-all active:scale-95">+</button>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[var(--muted)] hover:bg-[var(--border)] transition-all active:scale-90 ${color}`}
    >
      {icon}
      <span className="text-[9px] font-medium text-[var(--foreground)]">{label}</span>
    </button>
  );
}
