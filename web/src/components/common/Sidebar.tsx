'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, FolderOpen, Image, Settings, Bot, LayoutDashboard, HardDrive } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/', icon: MessageCircle, label: 'Chat' },
  { href: '/files', icon: FolderOpen, label: 'Files' },
  { href: '/gallery', icon: Image, label: 'Gallery' },
  { href: '/storage', icon: HardDrive, label: 'Storage' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-16 border-r border-[var(--border)] bg-[var(--card)]">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-[var(--border)]">
        <Bot size={28} className="text-[var(--primary)]" />
      </div>

      {/* Nav items */}
      <div className="flex flex-col items-center gap-2 py-4 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                isActive
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon size={20} />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
