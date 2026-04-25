'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ORDER = ['/', '/chat', '/live', '/dashboard', '/device', '/files', '/gallery'];

export default function SwipeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;

      // Only trigger on horizontal swipes (min 80px, less vertical than horizontal)
      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

      // Don't swipe on inputs, textareas, or scrollable elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('[data-no-swipe]')) return;

      const currentIdx = NAV_ORDER.indexOf(pathname);
      if (currentIdx < 0) return;

      if (dx > 0 && currentIdx > 0) {
        // Swipe right → go to previous page
        router.push(NAV_ORDER[currentIdx - 1]);
      } else if (dx < 0 && currentIdx < NAV_ORDER.length - 1) {
        // Swipe left → go to next page
        router.push(NAV_ORDER[currentIdx + 1]);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pathname, router]);

  return null;
}
