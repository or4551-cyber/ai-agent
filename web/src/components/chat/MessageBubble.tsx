'use client';

import CodeBlock from './CodeBlock';
import ToolCallCard from './ToolCallCard';

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
}

function parseContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parts.push(<span key={`t-${lastIndex}`} className="whitespace-pre-wrap">{textBefore}</span>);
    }
    // Code block
    parts.push(
      <CodeBlock key={`c-${match.index}`} language={match[1]} code={match[2].trim()} />
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push(<span key={`t-${lastIndex}`} className="whitespace-pre-wrap">{remaining}</span>);
  }

  return parts.length > 0 ? parts : [<span key="empty" className="whitespace-pre-wrap">{text}</span>];
}

export default function MessageBubble({ role, content, toolCalls, onApprove }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 animate-fade-in`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-br from-[var(--primary)] to-indigo-600 text-white rounded-br-sm shadow-lg shadow-[var(--primary)]/10'
            : 'bg-[var(--card)] border border-[var(--border)] rounded-bl-sm'
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

        {/* Message text */}
        {content && (
          <div className={`text-[14px] leading-[1.65] ${isUser ? '' : 'text-[var(--foreground)]'}`}>
            {parseContent(content)}
          </div>
        )}
      </div>
    </div>
  );
}
