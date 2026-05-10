// Sub-agent runner — lets the main agent spawn focused, lightweight workers
// for research/analysis tasks that benefit from parallel exploration.
//
// Why a fresh class instead of nesting ClaudeAgent?
//   - Sub-agents are stateless: no memory, no personality, no session
//     persistence. They get a single task, run it, and disappear.
//   - Tool whitelist: read-only by default. A sub-agent can't write files,
//     run shell commands, send messages, or modify state. This is enforced
//     at the dispatch layer — no tool-call can leak through.
//   - Always Haiku: cost discipline. The main agent decides; sub-agents
//     execute.
//
// Typical use cases:
//   - "Compare 3 VPN providers" → 3 sub-agents (one per provider) in parallel
//   - "Summarize the last 5 articles I bookmarked" → 5 sub-agents
//   - "Cross-check this claim against 3 sources" → 3 sub-agents

import Anthropic from '@anthropic-ai/sdk';
import { executeTool } from '../agent/tool-executor';
import { getToolDefinitions } from '../tools/definitions';
import { ToolDefinition } from '../types';

const HAIKU = 'claude-haiku-4-5-20251001';
const MAX_PARALLEL = 5;

const SUB_AGENT_SYSTEM = `אתה סוכן משנה של מרלין. נשלחת לבצע משימת חקירה/ניתוח ממוקדת.

## חוקי הפעולה שלך
- **אסור** לך לשנות מצב: לא לכתוב קבצים, לא להריץ פקודות, לא לשלוח הודעות, לא ליצור תזכורות/מטרות, לא לעדכן זיכרון.
- **מותר** לך רק כלי קריאה: web_search, web_browse, read_file, list_directory, search_files, memory_search, memory_get, gmail_list (קריאה), drive_list, gcal_list, weather, translate, summarize_url.
- אם הסוכן הראשי ביקש שתבצע משהו שאינו קריאה — תחזיר הודעה "לא יכול לבצע — סוכני משנה הם read-only" ותציע מה כן אפשר.
- **אל תשאל את המשתמש שאלות** — הוא לא נמצא. השתמש במה שיש לך.
- **תהיה תמציתי** — תשובה סופית של 1-3 פסקאות, עם המסקנות העיקריות.
- אם נגמרו לך הצעדים בלי לסיים — סכם מה גילית עד עכשיו.`;

// Tools sub-agents may call by default. Whitelist, not blacklist —
// a new tool added to the system isn't auto-available to sub-agents
// unless explicitly added here.
export const READ_ONLY_TOOL_WHITELIST = new Set<string>([
  'read_file', 'list_directory', 'search_files',
  'web_search', 'web_browse', 'summarize_url',
  'memory_search', 'memory_get', 'memory_list', 'memory_stats',
  'get_battery', 'get_clipboard', 'get_notifications', 'get_sensors',
  'gmail_list', 'gmail_read', 'gmail_search',
  'drive_list', 'drive_search', 'drive_get',
  'gcal_list', 'google_tasks_list', 'google_contacts',
  'calendar_list', 'whatsapp_messages', 'reminder_list', 'routine_list',
  'goal_list', 'storage_last_scan', 'system_status', 'audit',
  'media_now_playing',
]);

export interface SubAgentResult {
  task: string;
  result: string;
  iterations: number;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  errored?: boolean;
  errorMsg?: string;
}

export interface SubAgentOptions {
  task: string;
  apiKey: string;
  maxIterations?: number;
  // If provided, overrides the default whitelist. Only useful for tests
  // or carefully scoped extensions — DON'T let user input control this.
  toolsAllowed?: Set<string>;
}

export async function runSubAgent(opts: SubAgentOptions): Promise<SubAgentResult> {
  const maxIters = Math.max(1, Math.min(opts.maxIterations ?? 5, 10));
  const allowed = opts.toolsAllowed ?? READ_ONLY_TOOL_WHITELIST;
  const tools = getToolDefinitions().filter((t: ToolDefinition) => allowed.has(t.name));

  const client = new Anthropic({ apiKey: opts.apiKey });
  const history: Anthropic.MessageParam[] = [{ role: 'user', content: opts.task }];
  const toolsUsed: string[] = [];
  let lastText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < maxIters; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: HAIKU,
        max_tokens: 1500,
        system: SUB_AGENT_SYSTEM,
        tools: tools as Anthropic.Tool[],
        messages: history,
      });
    } catch (err) {
      return {
        task: opts.task,
        result: `Sub-agent failed: ${(err as Error).message}`,
        iterations: i,
        toolsUsed,
        inputTokens,
        outputTokens,
        errored: true,
        errorMsg: (err as Error).message,
      };
    }

    inputTokens += response.usage?.input_tokens || 0;
    outputTokens += response.usage?.output_tokens || 0;

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    if (textBlocks.length > 0) lastText = textBlocks.map((b) => b.text).join('\n');

    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (response.stop_reason === 'end_turn' || toolBlocks.length === 0) {
      return {
        task: opts.task,
        result: lastText || '(no output)',
        iterations: i + 1,
        toolsUsed,
        inputTokens,
        outputTokens,
      };
    }

    history.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tb of toolBlocks) {
      if (!allowed.has(tb.name)) {
        // Defense-in-depth: even though the tools list given to Anthropic
        // only contains whitelisted tools, double-check at dispatch.
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: `❌ Sub-agent is not allowed to call '${tb.name}'. Stick to read-only tools.`,
          is_error: true,
        });
        continue;
      }
      toolsUsed.push(tb.name);
      try {
        const result = await executeTool(tb.name, tb.input as Record<string, unknown>);
        // Cap individual tool output so a 50KB file dump doesn't explode the
        // sub-agent's context window.
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: result.output.length > 4000 ? result.output.slice(0, 4000) + '\n…[truncated]' : result.output,
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: 'Error: ' + (err as Error).message,
          is_error: true,
        });
      }
    }
    history.push({ role: 'user', content: toolResults });
  }

  return {
    task: opts.task,
    result: lastText || `(reached max iterations ${maxIters} without conclusion)`,
    iterations: maxIters,
    toolsUsed,
    inputTokens,
    outputTokens,
  };
}

// Run multiple sub-agents in parallel, capped to MAX_PARALLEL to keep token
// spend predictable.
export async function runSubAgentsParallel(
  tasks: string[],
  apiKey: string,
  maxIterationsEach?: number,
): Promise<SubAgentResult[]> {
  if (tasks.length === 0) return [];
  if (tasks.length > MAX_PARALLEL) {
    throw new Error(`Maximum ${MAX_PARALLEL} parallel sub-agents (got ${tasks.length})`);
  }
  return Promise.all(
    tasks.map((task) => runSubAgent({ task, apiKey, maxIterations: maxIterationsEach })),
  );
}

export function formatSubAgentResult(r: SubAgentResult): string {
  const meta = `_(${r.iterations} iterations · ${r.toolsUsed.length} tool calls · ${r.inputTokens + r.outputTokens} tokens)_`;
  if (r.errored) return `❌ ${r.task}\n${meta}\n\n${r.result}`;
  return `🤖 ${meta}\n\n${r.result}`;
}
