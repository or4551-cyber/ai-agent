'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentWebSocket, WSEvent } from '@/lib/websocket';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ChatInput, { ImageAttachment } from './ChatInput';
import { Wifi, WifiOff, Trash2, DollarSign, History, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import {
  listConversations, getConversation, saveConversation,
  deleteConversation, generateTitle, Conversation, StoredMessage
} from '@/lib/chat-storage';

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'running' | 'success' | 'error' | 'pending_approval';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

function getWsUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:3002/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return process.env.NEXT_PUBLIC_WS_URL || `${proto}//${window.location.host}/ws`;
}
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [typingStatus, setTypingStatus] = useState<'idle' | 'thinking' | 'typing' | 'tool'>('idle');
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting' | 'failed'>('disconnected');
  const [cost, setCost] = useState({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 });
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const wsRef = useRef<AgentWebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAssistantId = useRef<string>('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const selectedModel = typeof window !== 'undefined'
      ? localStorage.getItem('ai_model') || 'claude-sonnet-4-20250514'
      : 'claude-sonnet-4-20250514';
    const wsUrl = `${getWsUrl()}?model=${encodeURIComponent(selectedModel)}`;
    const ws = new AgentWebSocket(wsUrl, AUTH_TOKEN);
    wsRef.current = ws;

    ws.on('connection', (event: WSEvent) => {
      const status = event.payload.status as string;
      setConnected(status === 'connected');
      setConnectionStatus(status as any);
    });

    ws.on('text_delta', (event: WSEvent) => {
      const text = event.payload.text as string;
      setTypingStatus('typing');
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === currentAssistantId.current) {
          last.content += text;
        }
        return updated;
      });
      scrollToBottom();
    });

    ws.on('tool_call_start', (event: WSEvent) => {
      setTypingStatus('tool');
      const { id, name, input, dangerLevel } = event.payload;
      const toolCall: ToolCall = {
        id: id as string,
        name: name as string,
        input: input as Record<string, unknown>,
        status: dangerLevel === 'dangerous' ? 'pending_approval' : 'running',
      };

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === currentAssistantId.current) {
          last.toolCalls = [...(last.toolCalls || []), toolCall];
        }
        return updated;
      });
      scrollToBottom();
    });

    ws.on('tool_call_end', (event: WSEvent) => {
      const { id, output, approved } = event.payload;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === currentAssistantId.current && last.toolCalls) {
          const tc = last.toolCalls.find((t) => t.id === id);
          if (tc) {
            tc.output = output as string;
            tc.status = approved === false ? 'error' : 'success';
          }
        }
        return updated;
      });
      scrollToBottom();
    });

    ws.on('approval_request', (event: WSEvent) => {
      const { id } = event.payload;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === currentAssistantId.current && last.toolCalls) {
          const tc = last.toolCalls.find((t) => t.id === id);
          if (tc) {
            tc.status = 'pending_approval';
          }
        }
        return updated;
      });
      scrollToBottom();
    });

    ws.on('message_done', () => {
      setIsStreaming(false);
      setTypingStatus('idle');
      // Auto-save conversation
      setMessages((current) => {
        if (current.length > 0) {
          const now = new Date().toISOString();
          saveConversation({
            id: conversationId,
            title: generateTitle(current as StoredMessage[]),
            messages: current as StoredMessage[],
            createdAt: now,
            updatedAt: now,
          });
        }
        return current;
      });
    });

    ws.on('*', (event: WSEvent) => {
      if (event.type === 'usage_update' as any) {
        setCost({
          totalCost: event.payload.totalCost as number,
          totalInputTokens: event.payload.totalInputTokens as number,
          totalOutputTokens: event.payload.totalOutputTokens as number,
        });
      }
    });

    ws.on('error', (event: WSEvent) => {
      const errorMsg = event.payload.message as string;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === currentAssistantId.current) {
          last.content += `\n\n❌ Error: ${errorMsg}`;
        }
        return updated;
      });
      setIsStreaming(false);
      setTypingStatus('idle');
    });

    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [scrollToBottom]);

  // Auto-send pending command from capabilities page
  useEffect(() => {
    if (!connected) return;
    const pending = sessionStorage.getItem('pending_command');
    if (pending) {
      sessionStorage.removeItem('pending_command');
      setTimeout(() => handleSend(pending), 300);
    }
  }, [connected]);

  const handleSend = (message: string, images?: ImageAttachment[]) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: images ? `📷 ${message}` : message,
    };

    const assistantId = `assistant-${Date.now()}`;
    currentAssistantId.current = assistantId;

    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setTypingStatus('thinking');

    if (images && images.length > 0) {
      wsRef.current?.send('chat', {
        message,
        images: images.map((img) => ({
          base64: img.base64,
          mediaType: img.mediaType,
        })),
      });
    } else {
      wsRef.current?.sendMessage(message);
    }
    scrollToBottom();
  };

  const handleApprove = (toolId: string, approved: boolean) => {
    wsRef.current?.approveAction(toolId, approved);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.toolCalls) {
        const tc = last.toolCalls.find((t) => t.id === toolId);
        if (tc) {
          tc.status = approved ? 'running' : 'error';
          if (!approved) tc.output = 'Rejected by user';
        }
      }
      return updated;
    });
  };

  const handleClear = () => {
    setMessages([]);
    wsRef.current?.clearHistory();
    setConversationId(`conv-${Date.now()}`);
  };

  const newConversation = () => {
    setMessages([]);
    wsRef.current?.clearHistory();
    setConversationId(`conv-${Date.now()}`);
    setShowHistory(false);
  };

  const loadConversation = (id: string) => {
    const convo = getConversation(id);
    if (convo) {
      setMessages(convo.messages as Message[]);
      setConversationId(convo.id);
      // Note: server-side history won't match, but new messages will work
      wsRef.current?.clearHistory();
    }
    setShowHistory(false);
  };

  const toggleHistory = () => {
    if (!showHistory) {
      setConversations(listConversations());
    }
    setShowHistory(!showHistory);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[var(--primary)]/20">
            AI
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">AI Agent</h1>
            <div className="flex items-center gap-1.5 text-[11px]">
              {connectionStatus === 'connected' && (
                <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" /> <span className="text-emerald-400">מחובר</span></>
              )}
              {connectionStatus === 'reconnecting' && (
                <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> <span className="text-amber-400">מתחבר מחדש...</span></>
              )}
              {connectionStatus === 'failed' && (
                <button onClick={() => wsRef.current?.forceReconnect()} className="flex items-center gap-1 text-red-400 hover:text-red-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> נכשל — לחץ לחיבור מחדש
                </button>
              )}
              {connectionStatus === 'disconnected' && (
                <><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> <span className="text-red-400">מנותק</span></>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {cost.totalCost > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--muted)] text-[11px] text-[var(--muted-foreground)] font-mono" title={`In: ${cost.totalInputTokens.toLocaleString()} | Out: ${cost.totalOutputTokens.toLocaleString()}`}>
              <DollarSign size={11} />
              {cost.totalCost.toFixed(4)}
            </div>
          )}
          <button
            onClick={toggleHistory}
            className="p-2.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            title="History"
          >
            <History size={18} />
          </button>
          <button
            onClick={newConversation}
            className="p-2.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            title="New chat"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute inset-0 z-40 bg-[var(--background)] flex flex-col animate-fade-in">
          <div className="glass flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-bold tracking-tight">היסטוריית שיחות</h2>
            <button onClick={() => setShowHistory(false)} className="p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-[var(--muted)] flex items-center justify-center mb-4">
                  <History size={28} className="opacity-40" />
                </div>
                <div className="text-sm font-medium">אין שיחות שמורות</div>
                <div className="text-xs mt-1">שיחות חדשות יופיעו כאן</div>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((c) => {
                  const now = Date.now();
                  const diff = now - new Date(c.updatedAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  const hours = Math.floor(mins / 60);
                  const days = Math.floor(hours / 24);
                  const relTime = mins < 1 ? 'עכשיו' : mins < 60 ? `לפני ${mins} דק'` : hours < 24 ? `לפני ${hours} שע'` : days < 7 ? `לפני ${days} ימים` : new Date(c.updatedAt).toLocaleDateString('he-IL');
                  const preview = c.messages.find(m => m.role === 'user')?.content?.slice(0, 60) || '';

                  return (
                    <div key={c.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => loadConversation(c.id)}
                        className="flex-1 text-right px-3 py-2.5 rounded-xl hover:bg-[var(--muted)] transition-all"
                      >
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        {preview && <div className="text-[11px] text-[var(--muted-foreground)] truncate mt-0.5">{preview}</div>}
                        <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                          {c.messages.length} הודעות · {relTime}
                        </div>
                      </button>
                      <button
                        onClick={() => { deleteConversation(c.id); setConversations(listConversations()); }}
                        className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center mb-5 shadow-2xl shadow-[var(--primary)]/30">
              <span className="text-4xl">🤖</span>
            </div>
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-1.5">היי, מה נעשה?</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-[280px] mb-8 leading-relaxed">
              אני הסוכן שלך — שליטה מלאה על המכשיר, קבצים, מצלמה, הודעות ועוד.
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-xs">
              {[
                { icon: '🔋', label: 'סוללה', msg: 'כמה סוללה נשארה?' },
                { icon: '�️', label: 'סרוק אחסון', msg: 'תסרוק את האחסון ותגיד לי מה אפשר למחוק' },
                { icon: '📁', label: 'קבצים', msg: 'תראה לי את הקבצים בתיקייה הנוכחית' },
                { icon: '🧹', label: 'נקה cache', msg: 'תנקה את כל ה-cache במכשיר' },
                { icon: '🌤️', label: 'מזג אוויר', msg: 'מה מזג האוויר היום?' },
                { icon: '📸', label: 'צלם תמונה', msg: 'תצלם תמונה' },
                { icon: '📍', label: 'מיקום', msg: 'איפה אני נמצא?' },
                { icon: '🔔', label: 'התראות', msg: 'מה ההתראות האחרונות?' },
              ].map((shortcut, i) => (
                <button
                  key={shortcut.label}
                  onClick={() => handleSend(shortcut.msg)}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] hover:border-[var(--muted-foreground)]/20 transition-all text-sm text-right animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
                >
                  <span className="text-xl">{shortcut.icon}</span>
                  <span className="font-medium">{shortcut.label}</span>
                </button>
              ))}
            </div>
            <Link
              href="/capabilities"
              className="mt-4 flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-all animate-slide-up"
              style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}
            >
              <Sparkles size={13} />
              ראה את כל היכולות שלי
            </Link>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            toolCalls={msg.toolCalls}
            onApprove={handleApprove}
          />
        ))}
        {typingStatus === 'thinking' && <TypingIndicator label="חושב..." />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={!connected}
        isStreaming={isStreaming}
      />
    </div>
  );
}
