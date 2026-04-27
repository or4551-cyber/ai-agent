'use client';

import { Sparkles } from 'lucide-react';

export default function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex justify-start mb-4 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center shrink-0 mt-1 mr-2 shadow-lg shadow-[var(--primary)]/20 animate-pulse-soft">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5 shadow-sm">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--primary)]/60" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--primary)]/60" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '200ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--primary)]/60" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '400ms' }} />
        </div>
        {label && <span className="text-xs text-[var(--muted-foreground)]">{label}</span>}
      </div>
    </div>
  );
}
