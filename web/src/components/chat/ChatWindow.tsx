'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentWebSocket, WSEvent } from '@/lib/websocket';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ChatInput, { ImageAttachment } from './ChatInput';
import { DollarSign, History, Plus, Sparkles, X, Sun, Moon, Sunset, Coffee, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
  listConversations, getConversation, saveConversation,
  deleteConversation, generateTitle, Conversation, StoredMessage
} from '@/lib/chat-storage';
import { getProactiveAlerts, ProactiveAlert } from '@/lib/api';
import { enqueueMessage, getQueueSize, dequeueMessage, clearQueue } from '@/lib/message-queue';
import { WifiOff, Wifi } from 'lucide-react';

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
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [autoVoice, setAutoVoice] = useState(false);
  const wsRef = useRef<AgentWebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAssistantId = useRef<string>('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Online/Offline detection + queue flush
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); setQueueSize(getQueueSize()); };
    const goOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    setQueueSize(getQueueSize());
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Flush queued messages when reconnected
  useEffect(() => {
    if (connected && queueSize > 0) {
      const flush = async () => {
        // Remove old "saved in queue" placeholder bubbles
        setMessages(prev => prev.filter(m =>
          !(m.role === 'assistant' && m.content === '📥 ההודעה נשמרה בתור. תישלח אוטומטית כשהחיבור יחזור.')
        ));
        // Re-send each queued message properly (creates UI placeholders + sends via WS)
        let msg = dequeueMessage();
        while (msg) {
          handleSend(msg.message);
          // Small delay between messages so they don't overlap
          await new Promise(r => setTimeout(r, 500));
          msg = dequeueMessage();
        }
        setQueueSize(0);
      };
      setTimeout(flush, 1000);
    }
  }, [connected, queueSize]);

  // Proactive alerts polling
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await getProactiveAlerts();
        if (active && data.alerts) setAlerts(data.alerts);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));
  const dismissAlert = (id: string) => setDismissedAlerts(prev => new Set(prev).add(id));

  const alertToCommand = (alert: ProactiveAlert): string => {
    const typeMap: Record<string, string> = {
      whatsapp: 'תראה לי את ההודעות החדשות בוואטסאפ ותסכם אותן',
      battery: 'מה שורף לי סוללה? תן לי המלצות לחיסכון',
      sms: 'תראה לי את ההודעות האחרונות',
      reminder: 'תראה לי את התזכורות שלי',
      overdue_reminder: 'תראה לי תזכורות שעבר זמנן ותסדר אותן',
      meeting_reminder: 'מה הפגישה הקרובה שלי? תן לי פרטים',
      battery_suggestion: 'הסוללה חמה, מה אפשר לעשות?',
      storage: 'תסרוק את האחסון ותציע מה למחוק',
      spam: 'תראה לי התראות ספאם ותעזור לי להשתיק',
      morning: 'תן לי סיכום בוקר',
      night: 'תן לי סיכום לפני שינה',
      mail: 'תראה לי מיילים חדשים',
      calendar: 'מה ביומן שלי היום?',
      good_morning: 'תן לי סיכום בוקר מפורט — סוללה, יומן, תזכורות',
      good_night: 'תן לי סיכום לפני שינה — מה עשיתי היום ומה מחר',
      wellbeing_check: 'איך אני מבחינת בריאות? תבדוק דופק, תנועה ורמת לחץ',
      health_alert: 'תראה לי את נתוני הבריאות שלי ותנתח אותם',
      sedentary_alert: 'אני יושב יותר מדי, תציע לי פעילות קצרה',
    };
    return typeMap[alert.type] || `${alert.text} — תטפל בזה`;
  };

  useEffect(() => {
    const selectedModel = typeof window !== 'undefined'
      ? localStorage.getItem('ai_model') || 'claude-sonnet-4-6'
      : 'claude-sonnet-4-6';
    const wsUrl = `${getWsUrl()}?model=${encodeURIComponent(selectedModel)}&conversationId=${encodeURIComponent(conversationId)}`;
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

  // Auto-send pending command from capabilities page or ?cmd= URL param
  useEffect(() => {
    if (!connected) return;
    const pending = sessionStorage.getItem('pending_command');
    if (pending) {
      sessionStorage.removeItem('pending_command');
      setTimeout(() => handleSend(pending), 300);
      return;
    }
    // Check URL ?cmd= parameter (from Merlin Home quick apps)
    const params = new URLSearchParams(window.location.search);
    const cmd = params.get('cmd');
    if (cmd) {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => handleSend(cmd), 300);
      return;
    }
    // Check ?voice=1 parameter — auto-start voice input
    const voice = params.get('voice');
    if (voice === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      setAutoVoice(true);
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

    if (!connected) {
      // Queue message for later if not connected
      enqueueMessage(message);
      setQueueSize(getQueueSize());
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === assistantId) {
          last.content = '📥 ההודעה נשמרה בתור. תישלח אוטומטית כשהחיבור יחזור.';
        }
        return updated;
      });
      setIsStreaming(false);
      setTypingStatus('idle');
      scrollToBottom();
      return;
    }

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
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[var(--primary)]/20">
            M
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Merlin</h1>
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

      {/* Offline / Queue indicator */}
      {(!isOnline || !connected) && (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs">
          <WifiOff size={12} />
          <span>{!isOnline ? 'אין חיבור לאינטרנט' : 'לא מחובר לשרת'} — מצב offline פעיל</span>
          {queueSize > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold">{queueSize} בתור</span>}
        </div>
      )}

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

      {/* Alert Banner — clickable! */}
      {visibleAlerts.length > 0 && messages.length > 0 && (
        <div className="px-3 pt-2 space-y-1.5 animate-slide-down">
          {visibleAlerts.map(alert => (
            <div
              key={alert.id}
              onClick={() => {
                const cmd = alertToCommand(alert);
                if (cmd) handleSend(cmd);
                dismissAlert(alert.id);
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm border animate-fade-in cursor-pointer active:scale-[0.98] transition-transform ${
                alert.priority === 'high'
                  ? 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/15'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/15'
              }`}
            >
              <span className="text-base">{alert.icon}</span>
              <span className="flex-1 text-[13px]">{alert.text}</span>
              <span className="text-[10px] opacity-60 shrink-0">טפל בזה →</span>
              <button onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }} className="p-0.5 rounded hover:bg-white/10 shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            {/* Greeting */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-cyan-500 flex items-center justify-center mb-4 shadow-xl shadow-[var(--primary)]/20">
              {(() => {
                const h = new Date().getHours();
                if (h >= 6 && h < 12) return <Sun size={26} className="text-amber-300" />;
                if (h >= 12 && h < 17) return <Coffee size={26} className="text-orange-300" />;
                if (h >= 17 && h < 21) return <Sunset size={26} className="text-pink-300" />;
                return <Moon size={26} className="text-blue-300" />;
              })()}
            </div>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">
              {(() => {
                const h = new Date().getHours();
                if (h >= 6 && h < 12) return 'בוקר טוב! ☀️';
                if (h >= 12 && h < 17) return 'צהריים טובים! 🌤️';
                if (h >= 17 && h < 21) return 'ערב טוב! 🌆';
                return 'לילה טוב! 🌙';
              })()}
            </h2>
            <p className="text-[13px] text-[var(--muted-foreground)] max-w-[260px] mb-5 leading-relaxed">
              איך אפשר לעזור?
            </p>

            {/* Morning Briefing Card */}
            {new Date().getHours() >= 6 && new Date().getHours() < 10 && (
              <button
                onClick={() => handleSend('תן לי סיכום בוקר')}
                className="w-full max-w-xs mb-4 p-3.5 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-[var(--primary)]/10 text-right animate-slide-up"
                style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sun size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-[var(--foreground)]">סיכום בוקר</span>
                </div>
                <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">
                  סוללה, יומן, הודעות, תזכורות — הכל במקום אחד
                </p>
              </button>
            )}

            {/* Alert cards in empty state — clickable! */}
            {visibleAlerts.length > 0 && (
              <div className="w-full max-w-xs space-y-2 mb-4">
                {visibleAlerts.map(alert => (
                  <button
                    key={alert.id}
                    onClick={() => {
                      const cmd = alertToCommand(alert);
                      if (cmd) handleSend(cmd);
                      dismissAlert(alert.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] border text-right cursor-pointer active:scale-[0.98] transition-all ${
                      alert.priority === 'high' ? 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/15' : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/15'
                    } animate-fade-in`}
                  >
                    <span>{alert.icon}</span>
                    <span className="flex-1">{alert.text}</span>
                    <span className="text-[10px] opacity-50">→</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Actions — 2 rows of 4 */}
            <div className="grid grid-cols-4 gap-2 w-full max-w-xs">
              {[
                { icon: '🔋', label: 'סוללה', msg: 'כמה סוללה נשארה?' },
                { icon: '📅', label: 'יומן', msg: 'מה ביומן שלי היום?' },
                { icon: '�', label: 'מיילים', msg: 'תראה לי מיילים שלא קראתי' },
                { icon: '📸', label: 'צלם', msg: 'תצלם תמונה' },
                { icon: '💾', label: 'אחסון', msg: 'תסרוק את האחסון' },
                { icon: '�', label: 'מיקום', msg: 'איפה אני נמצא?' },
                { icon: '�', label: 'התראות', msg: 'מה ההתראות האחרונות?' },
                { icon: '✅', label: 'משימות', msg: 'תראה לי את המשימות שלי' },
              ].map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => handleSend(s.msg)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] hover:border-[var(--muted-foreground)]/20 transition-all animate-slide-up"
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
                >
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{s.label}</span>
                </button>
              ))}
            </div>
            <Link
              href="/capabilities"
              className="mt-4 flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-all animate-slide-up"
              style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}
            >
              <Sparkles size={13} />
              כל היכולות
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
        disabled={isStreaming}
        isStreaming={isStreaming}
        alerts={alerts}
        hasMessages={messages.length > 0}
        autoVoice={autoVoice}
        onAutoVoiceConsumed={() => setAutoVoice(false)}
      />
    </div>
  );
}
