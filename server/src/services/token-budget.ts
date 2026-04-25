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

// Anthropic API requires that any assistant message containing tool_use blocks
// is IMMEDIATELY followed by a user message containing matching tool_result blocks.
// Cutting in the middle of such a pair causes 400 invalid_request_error.
function startsWithToolResult(msg: HistoryMessage): boolean {
  if (msg.role !== 'user' || !Array.isArray(msg.content)) return false;
  return msg.content.some((b: any) => b && b.type === 'tool_result');
}

function endsWithToolUse(msg: HistoryMessage): boolean {
  if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return false;
  return msg.content.some((b: any) => b && b.type === 'tool_use');
}

/**
 * Adjust slice start so we never break a tool_use/tool_result pair.
 * If recentMessages starts with a tool_result, we must include the matching
 * tool_use assistant message before it. We walk backwards until we find
 * a clean cut point.
 */
function findSafeCutPoint(messages: HistoryMessage[], desiredStart: number): number {
  let cut = Math.max(0, Math.min(desiredStart, messages.length));
  // If the first message at the cut is a tool_result, walk backwards
  while (cut > 0 && cut < messages.length && startsWithToolResult(messages[cut])) {
    cut--;
  }
  // If cut now lands on an assistant message ending with tool_use,
  // walk one more back so the cut is BEFORE the assistant message
  // (otherwise we'd have an orphaned tool_use without history context)
  // Actually no — tool_use as the first message is fine, only tool_result is the issue.
  // Just ensure first kept message is not a tool_result.
  return cut;
}

/**
 * Strip messages that contain ONLY tool_use or ONLY tool_result blocks
 * but have no surrounding pair. Used as last resort.
 */
export function stripOrphanedTools(messages: HistoryMessage[]): HistoryMessage[] {
  return stripOrphanedToolBlocks(messages);
}

function stripOrphanedToolBlocks(messages: HistoryMessage[]): HistoryMessage[] {
  const result: HistoryMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (startsWithToolResult(m)) {
      // tool_result must follow assistant tool_use; if previous is missing/wrong, skip
      const prev = result[result.length - 1];
      if (!prev || !endsWithToolUse(prev)) continue;
    }
    if (endsWithToolUse(m)) {
      // tool_use must be followed by tool_result; check if next message has it
      const next = messages[i + 1];
      if (!next || !startsWithToolResult(next)) {
        // Convert to text-only assistant message (drop tool_use blocks)
        if (Array.isArray(m.content)) {
          const textOnly = m.content
            .filter((b: any) => b && b.type === 'text')
            .map((b: any) => b.text)
            .join('');
          if (textOnly.trim()) {
            result.push({ role: 'assistant', content: textOnly });
          }
          continue;
        }
      }
    }
    result.push(m);
  }
  return result;
}

/**
 * Trim conversation history to fit within token budget.
 * Strategy: keep last N messages, but never cut a tool_use/tool_result pair.
 * Older messages get a brief text summary.
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

  // Find a safe cut point that preserves tool_use/tool_result pairs
  const desiredStart = Math.max(0, messages.length - keepLast);
  const safeStart = findSafeCutPoint(messages, desiredStart);
  const recentMessages = stripOrphanedToolBlocks(messages.slice(safeStart));
  const olderMessages = messages.slice(0, safeStart);

  if (olderMessages.length === 0) {
    // Even recent messages are too many — truncate but preserve tool pairs
    return { messages: truncateMessages(recentMessages, maxTokens), trimmed: true, summary: null };
  }

  const summaryText = createQuickSummary(olderMessages);
  const summaryMessage: HistoryMessage = {
    role: 'user',
    content: `[סיכום שיחה קודמת: ${summaryText}]`,
  };

  // If recent starts with a tool_result, the summary message would break the pair too.
  // Drop the summary in that edge case.
  let result: HistoryMessage[];
  if (recentMessages.length > 0 && startsWithToolResult(recentMessages[0])) {
    result = recentMessages;
  } else {
    result = [summaryMessage, ...recentMessages];
  }

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

/**
 * Validate that a message array is safe to send to Anthropic API.
 * Returns true if every tool_use has a matching tool_result and vice versa.
 */
export function validateToolPairing(messages: HistoryMessage[]): boolean {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (endsWithToolUse(m)) {
      const next = messages[i + 1];
      if (!next || !startsWithToolResult(next)) return false;
    }
    if (startsWithToolResult(m)) {
      const prev = messages[i - 1];
      if (!prev || !endsWithToolUse(prev)) return false;
    }
  }
  return true;
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

  // Ensure we don't start with an orphaned tool_result
  while (result.length > 0 && startsWithToolResult(result[0])) {
    result.shift();
  }

  return stripOrphanedToolBlocks(result);
}

export { DEFAULT_CONFIG };
