'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, FolderOpen, Image, Settings, LayoutDashboard } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/', icon: MessageCircle, label: 'Chat' },
  { href: '/files', icon: FolderOpen, label: 'Files' },
  { href: '/gallery', icon: Image, label: 'Gallery' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-around border-t border-[var(--border)] bg-[var(--card)] px-2 py-1 md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? 'text-[var(--primary)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
