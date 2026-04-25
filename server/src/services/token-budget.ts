/**
 * Token Budget Manager
 * - Estimates token count for text
 * - Trims conversation history with sliding window + summarization
 * - Prioritizes context sections when budget is tight
 */

// Hebrew/mixed text averages ~3.5 chars per token; English ~4
const CHARS_PER_TOKEN_HE = 3.5;
const CHARS_PER_TOKEN_EN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const heChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const total = text.length;
  const heRatio = total > 0 ? heChars / total : 0;
  const charsPerToken = heRatio > 0.3 ? CHARS_PER_TOKEN_HE : CHARS_PER_TOKEN_EN;
  return Math.ceil(total / charsPerToken);
}

export interface TokenBudgetConfig {
  maxSystemPromptTokens: number;  // hard cap for system prompt
  maxHistoryTokens: number;       // hard cap for conversation history
  maxTotalTokens: number;         // overall budget per request
  summarizeAfter: number;         // summarize history after N messages
}

const DEFAULT_CONFIG: TokenBudgetConfig = {
  maxSystemPromptTokens: 3000,
  maxHistoryTokens: 12000,
  maxTotalTokens: 20000,
  summarizeAfter: 12,
};

interface ContextSection {
  key: string;
  content: string;
  priority: number; // higher = keep first
  tokens: number;
}

/**
 * Trim system prompt context to fit within budget.
 * Drops lowest-priority sections first.
 */
export function trimSystemContext(
  sections: { key: string; content: string; priority: number }[],
  maxTokens: number,
): { kept: { key: string; content: string }[]; dropped: string[]; totalTokens: number } {
  const scored: ContextSection[] = sections
    .filter(s => s.content && s.content.length > 0)
    .map(s => ({ ...s, tokens: estimateTokens(s.content) }));

  // Sort by priority descending (highest first = keep)
  scored.sort((a, b) => b.priority - a.priority);

  const kept: { key: string; content: string }[] = [];
  const dropped: string[] = [];
  let totalTokens = 0;

  for (const section of scored) {
    if (totalTokens + section.tokens <= maxTokens) {
      kept.push({ key: section.key, content: section.content });
      totalTokens += section.tokens;
    } else {
      dropped.push(section.key);
    }
  }

  return { kept, dropped, totalTokens };
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

/**
 * Trim conversation history to fit within token budget.
 * Strategy: keep first message (context) + last N messages, summarize middle.
 */
export function trimHistory(
  messages: HistoryMessage[],
  maxTokens: number,
  keepLast: number = 10,
): { messages: HistoryMessage[]; trimmed: boolean; summary: string | null } {
  if (messages.length === 0) return { messages: [], trimmed: false, summary: null };

  // Estimate total tokens
  let total = 0;
  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    total += estimateTokens(text);
  }

  if (total <= maxTokens) {
    return { messages, trimmed: false, summary: null };
  }

  // Keep the last N messages (most relevant)
  const recentMessages = messages.slice(-keepLast);

  // Summarize the older messages into a single context message
  const olderMessages = messages.slice(0, -keepLast);
  if (olderMessages.length === 0) {
    // Even recent messages are too many — truncate content
    return { messages: truncateMessages(recentMessages, maxTokens), trimmed: true, summary: null };
  }

  const summaryText = createQuickSummary(olderMessages);
  const summaryMessage: HistoryMessage = {
    role: 'user',
    content: `[סיכום שיחה קודמת: ${summaryText}]`,
  };

  const result = [summaryMessage, ...recentMessages];

  // Verify we're within budget now
  let newTotal = 0;
  for (const m of result) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    newTotal += estimateTokens(text);
  }

  if (newTotal > maxTokens) {
    return { messages: truncateMessages(recentMessages, maxTokens), trimmed: true, summary: summaryText };
  }

  return { messages: result, trimmed: true, summary: summaryText };
}

function createQuickSummary(messages: HistoryMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (typeof m.content !== 'string') continue;
    const text = m.content.substring(0, 100);
    if (m.role === 'user') parts.push(`משתמש: ${text}`);
  }
  // Keep summary compact
  return parts.slice(0, 5).join(' | ');
}

function truncateMessages(messages: HistoryMessage[], maxTokens: number): HistoryMessage[] {
  const result: HistoryMessage[] = [];
  let total = 0;

  // Work backwards — keep most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const tokens = estimateTokens(text);
    if (total + tokens > maxTokens) break;
    result.unshift(m);
    total += tokens;
  }

  return result;
}

export { DEFAULT_CONFIG };
