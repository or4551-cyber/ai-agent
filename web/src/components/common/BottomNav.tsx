'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, FolderOpen, Image, Settings, LayoutDashboard, HardDrive } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'בית' },
  { href: '/', icon: MessageCircle, label: 'צ\'אט' },
  { href: '/files', icon: FolderOpen, label: 'קבצים' },
  { href: '/gallery', icon: Image, label: 'גלריה' },
  { href: '/storage', icon: HardDrive, label: 'אחסון' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass flex items-center justify-around border-t border-[var(--border)] px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all relative ${
              isActive
                ? 'text-[var(--primary)]'
                : 'text-[var(--muted-foreground)] active:text-[var(--foreground)]'
            }`}
          >
            <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? 'bg-[var(--primary)]/10' : ''}`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
            </div>
            <span className={`text-[10px] transition-all ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
