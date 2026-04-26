'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2, Circle, Plus, Sparkles, Brain, Activity,
  Heart, Footprints, Users, Smartphone, Tablet, Monitor,
  FolderOpen, Image, Star, ChevronRight, X, Send, Bell,
  MessageCircle, ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  getReminders, completeReminder, addReminder, Reminder,
  getHealthStatus, getProximityStatus, HealthStatus, ProximityStatus,
  getDeviceInbox, markInboxRead, sendToDevice, InboxMessage,
} from '@/lib/api';

const DEVICE_ICONS: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  tablet: Tablet,
  pc: Monitor,
};

interface Peer {
  id: string;
  name: string;
  type: string;
  online: boolean;
  latencyMs?: number;
  model?: string;
}

export default function ChatSidePanel({ onClose }: { onClose?: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newReminder, setNewReminder] = useState('');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [proximity, setProximity] = useState<ProximityStatus | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [quickMsg, setQuickMsg] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [r, h, p] = await Promise.allSettled([
          getReminders(),
          getHealthStatus(),
          getProximityStatus(),
        ]);
        if (r.status === 'fulfilled') setReminders(r.value.reminders || []);
        if (h.status === 'fulfilled') setHealth(h.value);
        if (p.status === 'fulfilled') setProximity(p.value);
      } catch {}

      try {
        const token = localStorage.getItem('auth_token') || 'dev-token';
        const res = await fetch('/api/device-sync/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPeers(data.peers || []);
        }
      } catch {}

      try {
        const inboxData = await getDeviceInbox();
        setInbox(inboxData.messages || []);
        setUnreadCount(inboxData.unread || 0);
      } catch {}
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleComplete = async (id: string) => {
    await completeReminder(id);
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const handleAdd = async () => {
    if (!newReminder.trim()) return;
    const dueAt = new Date(Date.now() + 3600000).toISOString();
    await addReminder(newReminder.trim(), dueAt);
    setNewReminder('');
    const r = await getReminders();
    setReminders(r.reminders || []);
  };

  const stressColors: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-red-400', unknown: 'text-zinc-500' };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">פאנל מהיר</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Health Quick View */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity size={13} className="text-[var(--primary)]" />
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">בריאות</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <Heart size={14} className="mx-auto mb-1 text-pink-400" />
              <div className="text-sm font-bold">{health?.currentHeartRate ?? '—'}</div>
              <div className="text-[9px] text-zinc-500">דופק</div>
            </div>
            <div>
              <Footprints size={14} className="mx-auto mb-1 text-blue-400" />
              <div className="text-sm font-bold">
                {health?.todaySteps != null ? (health.todaySteps > 999 ? `${(health.todaySteps / 1000).toFixed(1)}k` : health.todaySteps) : '—'}
              </div>
              <div className="text-[9px] text-zinc-500">צעדים</div>
            </div>
            <div>
              <Users size={14} className={`mx-auto mb-1 ${proximity?.isAlone ? 'text-orange-400' : 'text-green-400'}`} />
              <div className="text-sm font-bold">{proximity?.nearbyDeviceCount ?? '—'}</div>
              <div className="text-[9px] text-zinc-500">{proximity?.isAlone ? 'לבד' : 'בסביבה'}</div>
            </div>
          </div>
        </div>

        {/* Reminders */}
        <div>
          <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={11} /> תזכורות
          </div>
          {reminders.length === 0 ? (
            <div className="text-[11px] text-[var(--muted-foreground)]">אין תזכורות</div>
          ) : (
            <div className="space-y-1 mb-2">
              {reminders.slice(0, 4).map(r => (
                <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                  <button onClick={() => handleComplete(r.id)} className="text-[var(--muted-foreground)] hover:text-green-400 transition-colors">
                    <Circle size={13} />
                  </button>
                  <span className="text-[11px] flex-1 truncate">{r.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={newReminder}
              onChange={(e) => setNewReminder(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="תזכורת חדשה..."
              dir="auto"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] focus:outline-none focus:border-[var(--primary)]"
            />
            <button onClick={handleAdd} disabled={!newReminder.trim()} className="px-2 py-1.5 rounded-lg bg-[var(--primary)] text-white text-[11px] disabled:opacity-30">
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* Connected Devices */}
        {peers.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Smartphone size={11} /> מכשירים מחוברים
            </div>
            <div className="space-y-1">
              {peers.map(peer => {
                const DeviceIcon = DEVICE_ICONS[peer.type] || Smartphone;
                return (
                  <div key={peer.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div className="relative">
                      <DeviceIcon size={14} className={peer.online ? 'text-[var(--foreground)]' : 'text-zinc-600'} />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${peer.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate">{peer.name}</div>
                    </div>
                    <span className={`text-[9px] ${peer.online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {peer.online ? `${peer.latencyMs || '?'}ms` : 'offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Send to Device */}
        {peers.filter(p => p.online).length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Send size={11} /> שלח למכשיר
            </div>
            {peers.filter(p => p.online).map(peer => (
              <div key={peer.id} className="mb-2">
                <div className="flex gap-1.5">
                  <input
                    value={sendingTo === peer.id ? quickMsg : ''}
                    onChange={(e) => { setSendingTo(peer.id); setQuickMsg(e.target.value); }}
                    onFocus={() => setSendingTo(peer.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && quickMsg.trim()) {
                        sendToDevice(peer.id, 'notification', { title: 'הודעה מ-Merlin', message: quickMsg.trim() });
                        setQuickMsg('');
                      }
                    }}
                    placeholder={`שלח ל${peer.name}...`}
                    dir="auto"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    onClick={() => {
                      if (quickMsg.trim()) {
                        sendToDevice(peer.id, 'notification', { title: 'הודעה מ-Merlin', message: quickMsg.trim() });
                        setQuickMsg('');
                      }
                    }}
                    disabled={!quickMsg.trim() || sendingTo !== peer.id}
                    className="px-2 py-1.5 rounded-lg bg-[var(--primary)] text-white text-[11px] disabled:opacity-30"
                  >
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inbox Messages */}
        {inbox.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1.5">
                <Bell size={11} /> הודעות נכנסות
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold">{unreadCount}</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => { markInboxRead(); setUnreadCount(0); setInbox(prev => prev.map(m => ({ ...m, read: true }))); }}
                  className="text-[9px] text-[var(--primary)] hover:underline"
                >
                  סמן הכל כנקרא
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-hide">
              {inbox.slice(0, 5).map(msg => (
                <div
                  key={msg.id}
                  className={`px-2 py-1.5 rounded-lg border border-[var(--border)] text-[11px] ${!msg.read ? 'bg-[var(--primary)]/5 border-[var(--primary)]/20' : 'bg-[var(--card)]'}`}
                >
                  <div className="flex items-center gap-1 text-[9px] text-[var(--muted-foreground)] mb-0.5">
                    <MessageCircle size={9} />
                    <span className="font-medium">{msg.fromName}</span>
                    <span>·</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="truncate">{(msg.payload?.message as string) || (msg.payload?.title as string) || msg.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { href: '/files', icon: FolderOpen, label: 'קבצים', color: 'text-purple-400' },
            { href: '/gallery', icon: Image, label: 'גלריה', color: 'text-emerald-400' },
            { href: '/favorites', icon: Star, label: 'מועדפים', color: 'text-amber-400' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-all"
              >
                <Icon size={16} className={item.color} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
