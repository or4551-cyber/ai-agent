'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import CodeBlock from './CodeBlock';
import ToolCallCard from './ToolCallCard';
import { Sparkles } from 'lucide-react';

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'running' | 'success' | 'error' | 'pending_approval';
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  onApprove?: (id: string, approved: boolean) => void;
  timestamp?: number;
}

function formatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ role, content, toolCalls, onApprove, timestamp }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in group`}>
      {/* Merlin avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center shrink-0 mt-1 mr-2 shadow-lg shadow-[var(--primary)]/20">
          <Sparkles size={14} className="text-white" />
        </div>
      )}

      <div className="flex flex-col max-w-[82%] md:max-w-[72%]">
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gradient-to-br from-[var(--primary)] to-indigo-600 text-white rounded-br-sm shadow-lg shadow-[var(--primary)]/10'
              : 'bg-[var(--card)] border border-[var(--border)] rounded-bl-sm shadow-sm'
          }`}
        >
          {/* Tool call cards (before text for assistant) */}
          {!isUser && toolCalls && toolCalls.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {toolCalls.map((tc) => (
                <ToolCallCard
                  key={tc.id}
                  id={tc.id}
                  name={tc.name}
                  input={tc.input}
                  output={tc.output}
                  status={tc.status}
                  onApprove={onApprove}
                />
              ))}
            </div>
          )}

          {/* Message text with markdown */}
          {content && (
            <div className={`text-[14px] leading-[1.7] ${isUser ? '' : 'text-[var(--foreground)]'}`}>
              {isUser ? (
                <span className="whitespace-pre-wrap">{content}</span>
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isBlock = String(children).includes('\n');
                        if (isBlock || match) {
                          return <CodeBlock language={match?.[1] || ''} code={String(children).replace(/\n$/, '')} />;
                        }
                        return (
                          <code className="bg-[var(--muted)] text-[var(--primary)] px-1.5 py-0.5 rounded-md text-[13px] font-mono" {...props}>
                            {children}
                          </code>
                        );
                      },
                      p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      strong({ children }) {
                        return <strong className="font-semibold text-white/95">{children}</strong>;
                      },
                      ul({ children }) {
                        return <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="text-[13.5px]">{children}</li>;
                      },
                      a({ href, children }) {
                        return (
                          <a href={href} target="_blank" rel="noopener noreferrer"
                            className="text-[var(--primary)] underline underline-offset-2 hover:text-white transition-colors">
                            {children}
                          </a>
                        );
                      },
                      blockquote({ children }) {
                        return (
                          <blockquote className="border-r-2 border-[var(--primary)]/50 pr-3 mr-1 my-2 text-zinc-400 italic">
                            {children}
                          </blockquote>
                        );
                      },
                      h1({ children }) { return <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>; },
                      h2({ children }) { return <h2 className="text-base font-bold mb-1.5 mt-2">{children}</h2>; },
                      h3({ children }) { return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>; },
                      hr() { return <hr className="border-[var(--border)] my-3" />; },
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span className={`text-[10px] text-zinc-600 mt-1 ${isUser ? 'text-left' : 'text-right'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}
