'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentWebSocket, WSEvent } from '@/lib/websocket';
import MessageBubble from './MessageBubble';
import ChatInput, { ImageAttachment } from './ChatInput';
import { Wifi, WifiOff, Trash2, DollarSign, History, Plus } from 'lucide-react';
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
  const [connected, setConnected] = useState(false);
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
      setConnected(event.payload.status === 'connected');
    });

    ws.on('text_delta', (event: WSEvent) => {
      const text = event.payload.text as string;
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
    });

    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [scrollToBottom]);

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold">
            AI
          </div>
          <div>
            <h1 className="text-sm font-semibold">AI Agent</h1>
            <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              {connected ? (
                <><Wifi size={12} className="text-green-400" /> Connected</>
              ) : (
                <><WifiOff size={12} className="text-red-400" /> Disconnected</>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cost.totalCost > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--muted)] text-xs text-[var(--muted-foreground)]" title={`In: ${cost.totalInputTokens.toLocaleString()} | Out: ${cost.totalOutputTokens.toLocaleString()}`}>
              <DollarSign size={12} />
              <span>${cost.totalCost.toFixed(4)}</span>
            </div>
          )}
          <button
            onClick={toggleHistory}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
            title="History"
          >
            <History size={18} />
          </button>
          <button
            onClick={newConversation}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
            title="New chat"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute inset-0 z-40 bg-[var(--background)] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Conversation History</h2>
            <button onClick={() => setShowHistory(false)} className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--muted-foreground)]">
                No saved conversations
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--muted)] transition-colors"
                  >
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {c.messages.length} messages &middot; {new Date(c.updatedAt).toLocaleDateString('he-IL')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-[var(--muted-foreground)]">
            <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mb-4">
              <span className="text-3xl">🤖</span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">AI Agent</h2>
            <p className="text-sm max-w-sm mb-6">
              אני יכול לשלוט במכשיר שלך — לערוך קבצים, להריץ פקודות, לארגן תמונות, לשלוח הודעות ועוד.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {[
                { icon: '🔋', label: 'סוללה', msg: 'כמה סוללה נשארה?' },
                { icon: '📍', label: 'מיקום', msg: 'איפה אני נמצא?' },
                { icon: '📁', label: 'קבצים', msg: 'תראה לי את הקבצים בתיקייה הנוכחית' },
                { icon: '🔔', label: 'התראות', msg: 'מה ההתראות האחרונות?' },
                { icon: '🌤️', label: 'מזג אוויר', msg: 'מה מזג האוויר היום?' },
                { icon: '📸', label: 'צלם תמונה', msg: 'תצלם תמונה' },
              ].map((shortcut) => (
                <button
                  key={shortcut.label}
                  onClick={() => handleSend(shortcut.msg)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors text-sm text-left"
                >
                  <span className="text-lg">{shortcut.icon}</span>
                  <span>{shortcut.label}</span>
                </button>
              ))}
            </div>
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
