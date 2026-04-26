'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle, FolderOpen, Image, Settings, Bot, LayoutDashboard,
  HardDrive, Home, Mic, Smartphone, Tablet, Monitor, Wifi, WifiOff,
  Sparkles, ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'בית' },
  { href: '/chat', icon: MessageCircle, label: 'צ\'אט' },
  { href: '/live', icon: Mic, label: 'Live' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'דשבורד' },
  { href: '/files', icon: FolderOpen, label: 'קבצים' },
  { href: '/gallery', icon: Image, label: 'גלריה' },
  { href: '/storage', icon: HardDrive, label: 'אחסון' },
  { href: '/settings', icon: Settings, label: 'הגדרות' },
];

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
}

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [isLg, setIsLg] = useState(false);

  // Detect lg breakpoint for auto-expand
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsLg(e.matches);
      if (e.matches) setExpanded(true);
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fetch device sync peers
  useEffect(() => {
    const fetchPeers = async () => {
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
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 30000);
    return () => clearInterval(interval);
  }, []);

  const showLabels = expanded || isLg;
  const sidebarWidth = showLabels ? 'w-52' : 'w-16';

  return (
    <aside className={`hidden md:flex flex-col ${sidebarWidth} border-r border-[var(--border)] bg-[var(--card)] transition-all duration-200 shrink-0`}>
      {/* Logo + Toggle */}
      <div className="flex items-center h-14 border-b border-[var(--border)] px-3 gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-white" />
        </div>
        {showLabels && (
          <span className="text-sm font-bold tracking-wide text-[var(--foreground)] animate-fade-in">Merlin</span>
        )}
        {!isLg && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mr-auto p-1 rounded-md hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
          >
            {expanded ? <ChevronLeft size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 py-3 px-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-xl transition-all ${
                showLabels ? 'px-3 py-2.5' : 'justify-center w-12 h-12 mx-auto'
              } ${
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/20'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} className="shrink-0" />
              {showLabels && (
                <span className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Connected Devices */}
      {peers.length > 0 && (
        <div className="border-t border-[var(--border)] px-2 py-3">
          {showLabels && (
            <div className="text-[10px] text-[var(--muted-foreground)] font-medium uppercase tracking-wider px-2 mb-2">
              מכשירים
            </div>
          )}
          <div className="flex flex-col gap-1">
            {peers.map((peer) => {
              const DeviceIcon = DEVICE_ICONS[peer.type] || Smartphone;
              return (
                <div
                  key={peer.id}
                  className={`flex items-center gap-2 rounded-lg ${showLabels ? 'px-2 py-1.5' : 'justify-center py-2'}`}
                  title={`${peer.name} — ${peer.online ? 'מחובר' : 'לא מחובר'}${peer.latencyMs ? ` (${peer.latencyMs}ms)` : ''}`}
                >
                  <div className="relative shrink-0">
                    <DeviceIcon size={16} className={peer.online ? 'text-[var(--foreground)]' : 'text-zinc-600'} />
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--card)] ${peer.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  </div>
                  {showLabels && (
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{peer.name}</div>
                      <div className={`text-[10px] ${peer.online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                        {peer.online ? `${peer.latencyMs || '?'}ms` : 'offline'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
