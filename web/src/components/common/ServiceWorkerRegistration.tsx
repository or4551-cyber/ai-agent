'use client';

import { useEffect } from 'react';

// Show a local push notification (no server push needed)
export function showNotification(title: string, body: string, url = '/chat') {
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url },
        dir: 'rtl',
        lang: 'he',
      } as NotificationOptions);
    });
  }
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }).catch((err) => {
        console.log('[SW] Registration failed:', err);
      });
    }
  }, []);

  return null;
}
