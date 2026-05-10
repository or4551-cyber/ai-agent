'use client';

// Per-route error boundary. Catches errors thrown inside any page in the app
// without losing the layout (sidebar / bottom nav remain visible).

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    console.error('[RouteError]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="text-lg font-semibold mb-2">בעיה בטעינת המסך</h2>
        <p className="text-zinc-400 text-sm mb-4">
          לא הצלחנו להציג את הדף הזה. שאר האפליקציה ממשיכה לעבוד.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-500 mb-4 font-mono break-all">
            קוד: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}
