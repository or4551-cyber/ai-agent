'use client';

// Catches errors in the root layout. Replaces the default Next.js dev/prod
// error overlay with a Hebrew, RTL-aware fallback that doesn't leave the user
// staring at a blank screen.

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Hook for telemetry — currently logs to console.
    // TODO: wire to /api/error-report on the server when that endpoint exists.
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="text-4xl mb-3">😬</div>
          <h1 className="text-xl font-semibold mb-2">משהו השתבש</h1>
          <p className="text-zinc-400 text-sm mb-4">
            מרלין נתקל בשגיאה לא צפויה. אפשר לנסות לטעון מחדש — ברוב המקרים זה פותר את זה.
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-500 mb-4 font-mono break-all">
              קוד שגיאה: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition"
            >
              נסה שוב
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium px-4 py-2 rounded-lg transition"
            >
              טען מחדש
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
