'use client';

// Top-of-screen banner that surfaces server lifecycle state to the user.
//
// Shows in three situations:
//   1. Server announced a restart (drain in progress) — orange "מתעדכן..."
//   2. Server is unreachable for >2 polls — red "מנסה להתחבר..."
//   3. Server just came back online after a recent restart — green "מוכן!"
//      (auto-hides after 3s)
//
// Data source: /api/system/health (cheap, public, no auth).

import { useEffect, useState } from 'react';

interface Health {
  status: string;
  supervised: boolean;
  uptimeSec: number;
  activeSessions: number;
  isDraining: boolean;
  lastRestart: { completedAt: number; wasGraceful: boolean } | null;
}

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'restart' }
  | { kind: 'offline' }
  | { kind: 'recovered'; until: number };

const HEALTH_URL = '/api/system/health';
const POLL_MS = 3000;

async function fetchHealth(): Promise<Health | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as Health;
  } catch {
    return null;
  }
}

export default function SystemStatusBanner() {
  const [state, setState] = useState<BannerState>({ kind: 'hidden' });

  useEffect(() => {
    let alive = true;
    let lastSuccess: Health | null = null;
    let consecutiveFailures = 0;

    async function tick() {
      const health = await fetchHealth();

      if (!alive) return;

      if (!health) {
        consecutiveFailures++;
        if (consecutiveFailures >= 2 && state.kind !== 'restart') {
          setState({ kind: 'offline' });
        }
      } else {
        // Detect "we came back from a recent restart" — uptime is tiny AND
        // a previous fetch saw the server.
        const justBooted = health.uptimeSec < 15;
        const wasOffline = consecutiveFailures >= 2 || (lastSuccess && lastSuccess.uptimeSec > health.uptimeSec);
        consecutiveFailures = 0;

        if (health.isDraining) {
          setState({ kind: 'restart' });
        } else if (wasOffline || justBooted) {
          setState({ kind: 'recovered', until: Date.now() + 3000 });
        } else if (state.kind === 'offline' || state.kind === 'restart') {
          setState({ kind: 'recovered', until: Date.now() + 3000 });
        }
        lastSuccess = health;
      }
    }

    // Auto-hide "recovered" after its expiration
    const hideTick = setInterval(() => {
      setState((s) => {
        if (s.kind === 'recovered' && Date.now() > s.until) return { kind: 'hidden' };
        return s;
      });
    }, 500);

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(hideTick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === 'hidden') return null;

  const config = {
    restart: {
      bg: 'bg-amber-600',
      icon: '🔄',
      text: 'מרלין מתעדכן... השיחה תישמר ותחזור בעוד רגע.',
    },
    offline: {
      bg: 'bg-red-600',
      icon: '⚠️',
      text: 'איבדתי קשר עם מרלין. מנסה להתחבר מחדש...',
    },
    recovered: {
      bg: 'bg-emerald-600',
      icon: '✓',
      text: 'מרלין חזר!',
    },
  }[state.kind];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${config.bg} text-white text-sm py-2 px-4 text-center font-medium shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300`}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.text}</span>
    </div>
  );
}
