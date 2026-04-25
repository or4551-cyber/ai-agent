'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, FolderOpen, Image, LayoutDashboard, Smartphone, Home, Menu, X, Mic } from 'lucide-react';
import { getProactiveAlerts } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'בית' },
  { href: '/chat', icon: MessageCircle, label: 'צ\'אט' },
  { href: '/live', icon: Mic, label: 'Live' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'דשבורד' },
  { href: '/device', icon: Smartphone, label: 'שלט' },
  { href: '/files', icon: FolderOpen, label: 'קבצים' },
  { href: '/gallery', icon: Image, label: 'גלריה' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await getProactiveAlerts();
        if (active) setAlertCount(data.alerts?.length || 0);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={menuRef} className="fixed bottom-4 left-4 z-50 md:hidden" style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      {/* Popup menu */}
      {open && (
        <div className="absolute bottom-14 left-0 glass border border-[var(--border)] rounded-2xl p-2 min-w-[160px] shadow-2xl shadow-black/40 animate-fade-in">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 relative ${
          open
            ? 'bg-[var(--muted)] text-[var(--foreground)] rotate-90'
            : 'bg-gradient-to-br from-[var(--primary)] to-purple-600 text-white shadow-[var(--primary)]/30'
        }`}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
        {!open && alertCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] text-white font-bold flex items-center justify-center shadow-md animate-pulse-soft">
            {alertCount}
          </span>
        )}
      </button>
    </div>
  );
}
