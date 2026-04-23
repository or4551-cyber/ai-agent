'use client';

export default function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)]" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)]" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '200ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)]" style={{ animation: 'bounce-dot 1.4s ease-in-out infinite', animationDelay: '400ms' }} />
        </div>
        {label && <span className="text-xs text-[var(--muted-foreground)]">{label}</span>}
      </div>
    </div>
  );
}
