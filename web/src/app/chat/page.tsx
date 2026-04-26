'use client';

import { useState, useEffect } from 'react';
import ChatWindow from "@/components/chat/ChatWindow";
import ChatSidePanel from "@/components/chat/ChatSidePanel";
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

export default function ChatPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsLg(e.matches);
      if (e.matches) setShowPanel(true);
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 relative">
      {/* Chat — full width on phone, flex on tablet */}
      <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${showPanel && isLg ? 'border-r border-[var(--border)]' : ''}`}>
        <ChatWindow />
      </div>

      {/* Side Panel — only on lg screens */}
      {showPanel && isLg && (
        <div className="w-72 xl:w-80 shrink-0 bg-[var(--background)] animate-fade-in">
          <ChatSidePanel onClose={() => setShowPanel(false)} />
        </div>
      )}

      {/* Toggle button — only on lg screens */}
      {isLg && (
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="absolute top-3 left-3 z-10 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-all shadow-sm"
          title={showPanel ? 'סגור פאנל' : 'פתח פאנל'}
        >
          {showPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      )}
    </div>
  );
}
