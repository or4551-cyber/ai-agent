'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Battery, BatteryCharging, Heart, Footprints, Bell,
  Smartphone, Tablet, Monitor, RefreshCw, Send,
  Wifi, WifiOff, Camera, Volume2, Sun, Flashlight,
  Activity, Zap, Thermometer, HardDrive, ArrowUpRight,
  MessageCircle,
} from 'lucide-react';
import {
  getDeviceStatus, DevicePeer, RemoteQuickStatus,
  getRemoteQuickStatus, sendToDevice, proxyToDevice,
  getHealthStatus, HealthStatus, sendHandoff,
} from '@/lib/api';

const DEVICE_ICONS: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  tablet: Tablet,
  pc: Monitor,
};

interface LocalStatus {
  battery: { percentage: number; status: string; temperature: number } | null;
  health: HealthStatus | null;
}

export default function MissionControlPage() {
  const [localDevice, setLocalDevice] = useState<{ id: string; name: string; type: string; model: string } | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalStatus>({ battery: null, health: null });
  const [peers, setPeers] = useState<DevicePeer[]>([]);
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, RemoteQuickStatus>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [quickMsg, setQuickMsg] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Get device status (includes peers)
      const status = await getDeviceStatus();
      setLocalDevice(status.device);
      setPeers(status.peers);

      // Get local battery & health
      const token = localStorage.getItem('auth_token') || 'dev-token';
      try {
        const localQuick = await fetch('/api/device-sync/quick-status').then(r => r.json());
        setLocalStatus({ battery: localQuick.battery, health: localQuick.health });
      } catch {}

      // Get remote statuses for all online peers
      const onlinePeers = status.peers.filter(p => p.online);
      const remoteResults: Record<string, RemoteQuickStatus> = {};
      await Promise.allSettled(
        onlinePeers.map(async (peer) => {
          try {
            const rs = await getRemoteQuickStatus(peer.id);
            remoteResults[peer.id] = rs;
          } catch {}
        })
      );
      setRemoteStatuses(remoteResults);
    } catch (err) {
      console.error('Mission control refresh failed:', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const doHandoff = async (peerId: string) => {
    try {
      const result = await sendHandoff(peerId);
      if (result.success) {
        setActionFeedback(`שיחה הועברה (${result.messageCount} הודעות)`);
      } else {
        setActionFeedback('אין שיחה פעילה להעברה');
      }
    } catch {
      setActionFeedback('שגיאה בהעברת שיחה');
    }
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const sendRemoteAction = async (peerId: string, action: string) => {
    try {
      await proxyToDevice(peerId, '/api/device-action', 'POST', { action });
      setActionFeedback(`${action} sent!`);
      setTimeout(() => setActionFeedback(null), 2000);
    } catch {
      setActionFeedback('Failed');
      setTimeout(() => setActionFeedback(null), 2000);
    }
  };

  const sendMsg = async (peerId: string) => {
    if (!quickMsg.trim()) return;
    await sendToDevice(peerId, 'notification', { title: 'Merlin', message: quickMsg.trim() });
    setQuickMsg('');
    setActionFeedback('Message sent!');
    setTimeout(() => setActionFeedback(null), 2000);
  };

  const batteryColor = (pct: number) => pct > 50 ? 'text-emerald-400' : pct > 20 ? 'text-amber-400' : 'text-red-400';
  const batteryBg = (pct: number) => pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="glass sticky top-0 z-10 flex items-center justify-between px-4 lg:px-6 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold">Mission Control</h1>
            <p className="text-[10px] text-[var(--muted-foreground)]">
              {lastRefresh ? `${lastRefresh.toLocaleTimeString('he-IL')}` : 'Loading...'}
              {peers.filter(p => p.online).length > 0 && ` · ${peers.filter(p => p.online).length} online`}
            </p>
          </div>
        </div>
        <button onClick={refresh} className="p-2.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Toast */}
      {actionFeedback && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-[var(--primary)] text-white text-sm font-medium shadow-lg animate-fade-in">
          {actionFeedback}
        </div>
      )}

      <div className="p-4 lg:p-6 space-y-4">
        {/* Device Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Local Device Card */}
          {localDevice && (
            <DeviceCard
              name={localDevice.name}
              type={localDevice.type}
              model={localDevice.model}
              isLocal={true}
              online={true}
              battery={localStatus.battery}
              health={localStatus.health}
              batteryColor={batteryColor}
              batteryBg={batteryBg}
            />
          )}

          {/* Remote Device Cards */}
          {peers.map(peer => {
            const rs = remoteStatuses[peer.id];
            return (
              <div key={peer.id} className="space-y-3">
                <DeviceCard
                  name={peer.name}
                  type={peer.type}
                  model={peer.model}
                  isLocal={false}
                  online={peer.online}
                  latencyMs={peer.latencyMs}
                  battery={rs?.battery || null}
                  health={rs?.health || null}
                  notifications={rs?.notifications || null}
                  batteryColor={batteryColor}
                  batteryBg={batteryBg}
                />

                {/* Remote Actions */}
                {peer.online && (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">שלט רחוק</div>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[
                        { icon: Camera, label: 'צלם', action: 'screenshot', color: 'text-cyan-400' },
                        { icon: Flashlight, label: 'פנס', action: 'toggle_flashlight', color: 'text-amber-400' },
                        { icon: Volume2, label: 'ווליום+', action: 'volume_up', color: 'text-purple-400' },
                        { icon: Bell, label: 'רטט', action: 'vibrate', color: 'text-pink-400' },
                      ].map(btn => {
                        const Icon = btn.icon;
                        return (
                          <button
                            key={btn.action}
                            onClick={() => sendRemoteAction(peer.id, btn.action)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] transition-all active:scale-90 ${btn.color}`}
                          >
                            <Icon size={16} />
                            <span className="text-[8px] font-medium text-[var(--foreground)]">{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Handoff */}
                    <button
                      onClick={() => doHandoff(peer.id)}
                      className="w-full py-2 mb-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white text-[11px] font-medium hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <ArrowUpRight size={12} /> העבר שיחה ל{peer.name}
                    </button>
                    {/* Quick message */}
                    <div className="flex gap-1.5">
                      <input
                        value={sendingTo === peer.id ? quickMsg : ''}
                        onChange={(e) => { setSendingTo(peer.id); setQuickMsg(e.target.value); }}
                        onFocus={() => setSendingTo(peer.id)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMsg(peer.id)}
                        placeholder={`הודעה ל${peer.name}...`}
                        dir="auto"
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11px] focus:outline-none focus:border-[var(--primary)]"
                      />
                      <button
                        onClick={() => sendMsg(peer.id)}
                        disabled={!quickMsg.trim() || sendingTo !== peer.id}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--primary)] text-white disabled:opacity-30"
                      >
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {peers.length === 0 && !loading && (
          <div className="text-center py-12 text-[var(--muted-foreground)]">
            <Smartphone size={40} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm font-medium mb-1">אין מכשירים מחוברים</div>
            <div className="text-xs">חבר מכשיר עם:</div>
            <code className="text-[10px] bg-[var(--muted)] px-2 py-1 rounded mt-2 inline-block">
              POST /api/device-sync/add-peer {`{"ip":"...", "port":3002}`}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCard({
  name, type, model, isLocal, online, latencyMs, battery, health, notifications,
  batteryColor, batteryBg,
}: {
  name: string;
  type: string;
  model: string;
  isLocal: boolean;
  online: boolean;
  latencyMs?: number;
  battery: { percentage: number; status: string; temperature: number } | null;
  health: HealthStatus | null;
  notifications?: { count: number } | null;
  batteryColor: (pct: number) => string;
  batteryBg: (pct: number) => string;
}) {
  const DeviceIcon = DEVICE_ICONS[type] || Smartphone;

  return (
    <div className={`rounded-2xl border bg-[var(--card)] p-4 ${online ? 'border-[var(--border)]' : 'border-zinc-800 opacity-50'}`}>
      {/* Device Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isLocal ? 'bg-gradient-to-br from-[var(--primary)] to-purple-600' : online ? 'bg-gradient-to-br from-cyan-500 to-blue-600' : 'bg-zinc-800'}`}>
          <DeviceIcon size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{name}</span>
            {isLocal && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] font-medium">THIS</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <span>{model}</span>
            {latencyMs != null && <span>· {latencyMs}ms</span>}
          </div>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        {/* Battery */}
        <div className="rounded-xl bg-[var(--background)] p-2 text-center">
          {battery ? (
            <>
              <div className="flex items-center justify-center gap-1 mb-1">
                {battery.status === 'CHARGING' ? (
                  <BatteryCharging size={12} className="text-emerald-400" />
                ) : (
                  <Battery size={12} className={batteryColor(battery.percentage)} />
                )}
              </div>
              <div className={`text-lg font-bold ${batteryColor(battery.percentage)}`}>{battery.percentage}%</div>
              <div className="text-[8px] text-[var(--muted-foreground)]">
                {battery.status === 'CHARGING' ? 'charging' : `${battery.temperature}°C`}
              </div>
            </>
          ) : (
            <div className="text-[10px] text-zinc-600 py-2">—</div>
          )}
        </div>

        {/* Heart Rate */}
        <div className="rounded-xl bg-[var(--background)] p-2 text-center">
          <Heart size={12} className="mx-auto mb-1 text-pink-400" />
          <div className="text-lg font-bold">{health?.currentHeartRate ?? '—'}</div>
          <div className="text-[8px] text-[var(--muted-foreground)]">bpm</div>
        </div>

        {/* Steps */}
        <div className="rounded-xl bg-[var(--background)] p-2 text-center">
          <Footprints size={12} className="mx-auto mb-1 text-blue-400" />
          <div className="text-lg font-bold">
            {health?.todaySteps != null ? (health.todaySteps > 999 ? `${(health.todaySteps / 1000).toFixed(1)}k` : health.todaySteps) : '—'}
          </div>
          <div className="text-[8px] text-[var(--muted-foreground)]">steps</div>
        </div>
      </div>

      {/* Notifications badge */}
      {notifications && notifications.count > 0 && (
        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px]">
          <Bell size={10} />
          <span>{notifications.count} notifications</span>
        </div>
      )}
    </div>
  );
}
