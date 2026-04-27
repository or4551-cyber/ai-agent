import Anthropic from '@anthropic-ai/sdk';
import { getToolDefinitions, getDangerLevel } from '../tools/definitions';
import { executeTool } from './tool-executor';
import { buildSystemPrompt } from './system-prompt';
import { WSResponse } from '../types';
import { AgentMemory } from './memory';
import { UserProfileService } from '../services/user-profile';
import { ConversationLearner } from '../services/conversation-learner';
import { LocalLLM } from './local-llm';
import { FavoritesService } from '../services/favorites';
import { PersonalityEngine } from '../services/personality-engine';
import { estimateTokens, trimHistory, trimSystemContext, validateToolPairing, stripOrphanedTools } from '../services/token-budget';
import { agentMemory, userProfileService, favoritesService, updateAwareness } from '../services/registry';

// Patterns that indicate a simple query answerable by local LLM (no tools needed)
const LOCAL_LLM_PATTERNS = [
  /^(מה השעה|מה התאריך|מה היום)/i,
  /^(תודה|בסדר|אוקיי|ok|thanks|bye|להתראות|שלום)/i,
  /^(ספר לי בדיחה|תספר בדיחה|joke)/i,
  /^(מה זה |הסבר |define |explain )/i,
  /^(תרגם |translate )/i,
  /^(היי|שלום|הי|בוקר טוב|ערב טוב)/i,
];

// Patterns for Haiku — needs Claude intelligence but NOT tools (75% cheaper)
const HAIKU_PATTERNS = [
  /^(מה דעתך|מה אתה חושב|what do you think)/i,
  /^(תסביר|explain|הסבר לי)/i,
  /^(תכתוב|write|כתוב לי)/i,
  /^(תסכם|summarize|סכם)/i,
  /^(איך |how |למה |why )/i,
  /^(מה ההבדל|what.s the difference)/i,
  /^(תן לי רעיון|suggest|הצע)/i,
  /^(תתרגם|translate|תרגם)/i,
];
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// Patterns that demand the strongest model (complex reasoning, self-repair)
const POWER_PATTERNS = [
  /תתקן|תקן את|fix|debug|תדבג|תשדרג|upgrade/i,
  /שגיאה|error|bug|crash|נפל|לא עובד|broken/i,
  /תנתח את הקוד|analyze code|refactor/i,
  /תכתוב סקריפט מורכב|complex script/i,
  /תבנה|build|architect|תתכנן מערכת/i,
];

// Retry config
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

interface MessageParam {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

export class ClaudeAgent {
  private client: Anthropic;
  private model: string;
  private conversationHistory: MessageParam[] = [];
  private onEvent: (event: WSResponse) => void;
  private pendingApprovals: Map<string, (approved: boolean) => void> = new Map();
  private memory: AgentMemory;
  private userProfile: UserProfileService;
  private learner: ConversationLearner | null;
  private toolsUsedThisSession: string[] = [];
  private conversationId: string;
  private usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };

  // Session intent tracker — compact log of what user asked for (survives history trimming)
  private sessionIntents: string[] = [];

  // Pricing per million tokens
  private static PRICING: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4 },
    'claude-opus-4-7': { input: 15, output: 75 },
    'claude-opus-4-20250514': { input: 15, output: 75 },
  };

  // Strongest available model — Opus 4.7 for hard tasks
  private static POWER_MODEL = 'claude-opus-4-7';

  private localLLM: LocalLLM;
  private favorites: FavoritesService;
  private personality: PersonalityEngine;
  private liveMode = false;
  private failedWithSonnet = false; // escalation flag

  constructor(
    apiKey: string,
    onEvent: (event: WSResponse) => void,
    model = 'claude-sonnet-4-6'
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.onEvent = onEvent;
    // Use shared singletons — avoids duplicate state and disk reads
    this.memory = agentMemory;
    this.userProfile = userProfileService;
    this.conversationId = `conv-${Date.now()}`;
    this.learner = new ConversationLearner(apiKey, this.userProfile);
    this.localLLM = new LocalLLM();
    this.favorites = favoritesService;
    this.personality = new PersonalityEngine(apiKey);

    // Record that user is active
    this.userProfile.recordActivity();
  }

  // ===== HYBRID LLM ROUTER =====
  private canUseLocalLLM(message: string, images?: { base64: string; mediaType: string }[]): boolean {
    // Never use local LLM for images or long conversations that need context
    if (images && images.length > 0) return false;
    if (this.conversationHistory.length > 4) return false; // Multi-turn needs Claude
    if (!this.localLLM.isAvailable()) return false;
    
    // Check if message is a simple pattern
    return LOCAL_LLM_PATTERNS.some(p => p.test(message.trim()));
  }

  private async processLocal(message: string): Promise<string> {
    console.log('[Agent] Routing to local LLM (free, offline)');
    try {
      const response = this.localLLM.generate(message);
      
      this.onEvent({ type: 'text_delta', payload: { text: response } });
      this.onEvent({ type: 'message_done', payload: { text: response } });
      this.onEvent({
        type: 'usage_update' as any,
        payload: { inputTokens: 0, outputTokens: 0, messageCost: 0, totalInputTokens: this.usage.inputTokens, totalOutputTokens: this.usage.outputTokens, totalCost: this.usage.totalCost },
      });

      this.conversationHistory.push({ role: 'user', content: message });
      this.conversationHistory.push({ role: 'assistant', content: response });
      this.userProfile.recordMessage();

      return response;
    } catch {
      // Fallback to Claude if local fails
      console.log('[Agent] Local LLM failed, falling back to Claude');
      return this.processCloud(message);
    }
  }

  private async processCloud(message: string, images?: { base64: string; mediaType: string }[]): Promise<string> {
    return this._processWithClaude(message, images, this.model, true);
  }

  private shouldUseHaiku(message: string, images?: { base64: string; mediaType: string }[]): boolean {
    if (images && images.length > 0) return false;
    if (this.liveMode) return false;
    if (this.failedWithSonnet) return false; // don't downgrade after failure
    return HAIKU_PATTERNS.some(p => p.test(message.trim()));
  }

  private shouldUsePowerModel(message: string): boolean {
    if (this.failedWithSonnet) return true; // escalate after failure
    if (this.toolsUsedThisSession.length > 8) return true; // complex multi-tool session
    return POWER_PATTERNS.some(p => p.test(message.trim()));
  }

  // Determine which model tier to use
  private selectModel(message: string, images?: { base64: string; mediaType: string }[]): { model: string; tier: 'haiku' | 'sonnet' | 'power'; useTools: boolean } {
    if (this.shouldUseHaiku(message, images)) {
      return { model: HAIKU_MODEL, tier: 'haiku', useTools: false };
    }
    if (this.shouldUsePowerModel(message)) {
      return { model: ClaudeAgent.POWER_MODEL, tier: 'power', useTools: true };
    }
    return { model: this.model, tier: 'sonnet', useTools: true };
  }

  async processMessage(
    userMessage: string,
    images?: { base64: string; mediaType: string }[]
  ): Promise<string> {
    // Try local LLM for simple queries (saves API cost, works offline)
    if (this.canUseLocalLLM(userMessage, images)) {
      return this.processLocal(userMessage);
    }

    const { model, tier, useTools } = this.selectModel(userMessage, images);
    const tierNames = { haiku: 'Haiku (cheap)', sonnet: 'Sonnet', power: 'Power' };
    console.log(`[Agent] Routing to ${tierNames[tier]} (${model})`);

    return this._processWithClaude(userMessage, images, model, useTools);
  }

  private async _processWithClaude(
    userMessage: string,
    images?: { base64: string; mediaType: string }[],
    activeModel?: string,
    useTools = true,
  ): Promise<string> {
    const model = activeModel || this.model;

    // Snapshot history length so we can roll back cleanly on hard failure
    const historySnapshotLength = this.conversationHistory.length;

    // Build user content — text only or multimodal with images
    let userContent: string | ContentBlock[];
    if (images && images.length > 0) {
      const blocks: ContentBlock[] = [];
      for (const img of images) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.base64,
          },
        });
      }
      blocks.push({ type: 'text', text: userMessage });
      userContent = blocks;
    } else {
      userContent = userMessage;
    }

    // Track user intent (survives history trimming)
    if (userMessage.length > 3) {
      this.sessionIntents.push(userMessage.substring(0, 200));
      // Keep last 15 intents
      if (this.sessionIntents.length > 15) this.sessionIntents.shift();
    }

    this.conversationHistory.push({
      role: 'user',
      content: userContent,
    });

    // === TOKEN BUDGET: trim history if too large ===
    // Tool-heavy convos need more history — each tool_use/tool_result pair = 2 messages
    const { messages: trimmedHistory, trimmed } = trimHistory(
      this.conversationHistory as { role: 'user' | 'assistant'; content: string | any[] }[],
      16000, // max history tokens (increased for tool-heavy flows)
      20,    // keep last 20 messages (tool pairs eat 2 msgs each)
    );
    if (trimmed) {
      console.log(`[Agent] History trimmed: ${this.conversationHistory.length} → ${trimmedHistory.length} messages`);
      this.conversationHistory = trimmedHistory;
    }

    // === SAFETY: validate tool_use/tool_result pairing before sending ===
    if (!validateToolPairing(this.conversationHistory as any)) {
      console.warn('[Agent] Tool pairing invalid — auto-repairing history');
      this.conversationHistory = stripOrphanedTools(this.conversationHistory as any);
    }

    // === TOKEN BUDGET: build system prompt with priority trimming ===
    const systemPrompt = this.buildBudgetedSystemPrompt();

    // === DEBUG LOGGING: track request shape ===
    const sysTokenEst = estimateTokens(systemPrompt);
    const histTokenEst = this.conversationHistory.reduce((sum, m) => {
      const t = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + estimateTokens(t);
    }, 0);
    console.log(`[Agent] → ${model} | system=${sysTokenEst}tok | history=${this.conversationHistory.length}msgs/${histTokenEst}tok | tools=${useTools ? 'yes' : 'no'}`);
    const requestStartMs = Date.now();

    let finalText = '';
    let continueLoop = true;

    while (continueLoop) {
      const maxTokens = this.liveMode ? 1024 : (model === HAIKU_MODEL ? 2048 : 8192);

      // === RATE LIMIT: retry with exponential backoff ===
      let response: Anthropic.Message | undefined;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const waitMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            console.log(`[Agent] Rate limited — retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms`);
            this.onEvent({ type: 'text_delta', payload: { text: `\n⏳ ממתין ${(waitMs / 1000).toFixed(1)} שניות (rate limit)...\n` } });
            await new Promise(r => setTimeout(r, waitMs));
          }

          // === PROMPT CACHING: cache system prompt + tools (5min TTL by default) ===
          // The system prompt and 81 tool definitions are mostly static — caching them
          // gives ~90% discount on input tokens and ~2x faster response on cache hits.
          const systemBlocks: Anthropic.TextBlockParam[] = [
            { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
          ];

          let toolsForRequest: Anthropic.Tool[] | undefined;
          if (useTools) {
            const tools = getToolDefinitions() as Anthropic.Tool[];
            // Mark the LAST tool with cache_control — caches everything before it
            toolsForRequest = tools.map((t, i) =>
              i === tools.length - 1
                ? ({ ...t, cache_control: { type: 'ephemeral' } } as Anthropic.Tool)
                : t,
            );
          }

          const stream = this.client.messages.stream({
            model,
            max_tokens: maxTokens,
            system: systemBlocks as any,
            ...(toolsForRequest ? { tools: toolsForRequest } : {}),
            messages: this.conversationHistory as Anthropic.MessageParam[],
          });

          stream.on('text', (text) => {
            finalText += text;
            this.onEvent({ type: 'text_delta', payload: { text } });
          });

          response = await stream.finalMessage();
          const elapsedMs = Date.now() - requestStartMs;
          console.log(`[Agent] ← ${model} response in ${elapsedMs}ms (stop=${response.stop_reason})`);
          lastError = null;
          break; // success

        } catch (err) {
          lastError = err as Error;
          const errMsg = (err as any)?.error?.error?.type || (err as Error).message || '';

          if (errMsg.includes('rate_limit') || errMsg.includes('overloaded') || (err as any)?.status === 429 || (err as any)?.status === 529) {
            if (attempt === MAX_RETRIES) {
              // Final fallback: try Haiku (different rate limit bucket)
              if (model !== HAIKU_MODEL) {
                console.log('[Agent] All retries failed — falling back to Haiku');
                this.onEvent({ type: 'text_delta', payload: { text: '\n🔄 מעבר למודל מהיר...\n' } });
                // Roll back history fully — including any tool_use/tool_result blocks
                // added during this run — so Haiku gets a clean slate.
                this.conversationHistory = this.conversationHistory.slice(0, historySnapshotLength);
                return this._processWithClaude(userMessage, images, HAIKU_MODEL, false);
              }
            }
            continue; // retry
          }
          // Non-rate-limit error — log details and roll back history before throwing
          const apiErrDetails = (err as any)?.error?.error?.message || (err as any)?.message || String(err);
          const apiErrStatus = (err as any)?.status || 'unknown';
          console.error(`[Agent] API error (status ${apiErrStatus}): ${apiErrDetails}`);
          // Roll back so retry-from-user works without orphaned tool blocks
          this.conversationHistory = this.conversationHistory.slice(0, historySnapshotLength);
          throw err;
        }
      }

      if (lastError) throw lastError;

      // Track usage — account for prompt caching (cached read = 10% of input price)
      const usage = response!.usage as any;
      const inTok = usage?.input_tokens || 0;
      const outTok = usage?.output_tokens || 0;
      const cacheReadTok = usage?.cache_read_input_tokens || 0;
      const cacheWriteTok = usage?.cache_creation_input_tokens || 0;

      this.usage.inputTokens += inTok + cacheReadTok + cacheWriteTok;
      this.usage.outputTokens += outTok;
      const pricing = ClaudeAgent.PRICING[model] || { input: 3, output: 15 };
      // cache writes cost 1.25x input, cache reads cost 0.1x input
      const msgCost = (
        inTok * pricing.input +
        cacheWriteTok * pricing.input * 1.25 +
        cacheReadTok * pricing.input * 0.1 +
        outTok * pricing.output
      ) / 1_000_000;
      this.usage.totalCost += msgCost;

      if (cacheReadTok > 0 || cacheWriteTok > 0) {
        console.log(`[Agent] Cache: ${cacheReadTok} read, ${cacheWriteTok} write, ${inTok} fresh input, ${outTok} output`);
      }

      this.onEvent({
        type: 'usage_update' as any,
        payload: {
          inputTokens: inTok,
          outputTokens: outTok,
          cacheReadTokens: cacheReadTok,
          cacheWriteTokens: cacheWriteTok,
          messageCost: Math.round(msgCost * 100000) / 100000,
          totalInputTokens: this.usage.inputTokens,
          totalOutputTokens: this.usage.outputTokens,
          totalCost: Math.round(this.usage.totalCost * 100000) / 100000,
        },
      });

      // Process content blocks for tool calls
      const assistantContent: ContentBlock[] = [];
      const toolResults: ContentBlock[] = [];
      continueLoop = false;

      for (const block of response!.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text });
          // text_delta already emitted via stream
        } else if (block.type === 'tool_use') {
          continueLoop = true;
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });

          // Track tool usage for learning
          this.toolsUsedThisSession.push(block.name);

          this.onEvent({
            type: 'tool_call_start',
            payload: {
              id: block.id,
              name: block.name,
              input: block.input,
              dangerLevel: getDangerLevel(block.name),
            },
          });

          // Check if approval is needed
          const dangerLevel = getDangerLevel(block.name);
          let approved = true;

          if (dangerLevel === 'dangerous' && !this.liveMode) {
            approved = await this.requestApproval(block.id, block.name, block.input as Record<string, unknown>);
          }

          let result: string;
          if (approved) {
            const execResult = await executeTool(block.name, block.input as Record<string, unknown>);
            result = execResult.output;
          } else {
            result = 'Action cancelled by user.';
          }

          // Truncate large tool outputs to prevent history bloat
          const MAX_TOOL_OUTPUT = 2000;
          const truncatedResult = result.length > MAX_TOOL_OUTPUT
            ? result.substring(0, MAX_TOOL_OUTPUT) + `\n...[חתוך — ${result.length} תווים]`
            : result;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: truncatedResult,
          });

          this.onEvent({
            type: 'tool_call_end',
            payload: {
              id: block.id,
              name: block.name,
              output: result.substring(0, 500),
              approved,
            },
          });
        }
      }

      // Add assistant message to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantContent,
      });

      // If there were tool calls, add results and continue loop
      if (toolResults.length > 0) {
        this.conversationHistory.push({
          role: 'user',
          content: toolResults,
        });
      }

      // Stop if Claude says stop
      if (response!.stop_reason === 'end_turn' && !continueLoop) {
        continueLoop = false;
      }
    }

    // Track message count
    this.userProfile.recordMessage();

    // Background: learn from this conversation (non-blocking)
    this.learnInBackground();

    this.onEvent({
      type: 'message_done',
      payload: { text: finalText },
    });

    return finalText;
  }

  private learnInBackground(): void {
    if (!this.learner) return;
    // Only learn after enough messages (at least 2 user+assistant pairs)
    const userMessages = this.conversationHistory.filter(m => m.role === 'user').length;
    if (userMessages < 2) return;

    const simplified = this.conversationHistory
      .filter(m => typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content as string }));

    // Fire and forget — don't block the response
    this.learner.learnFromConversation(
      this.conversationId,
      simplified,
      [...new Set(this.toolsUsedThisSession)]
    ).catch(() => {});
  }

  private requestApproval(
    toolId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(toolId, resolve);

      this.onEvent({
        type: 'approval_request',
        payload: {
          id: toolId,
          toolName,
          input,
          message: `⚠️ Action requires approval: ${toolName}`,
        },
      });

      // Auto-reject after 60 seconds
      setTimeout(() => {
        if (this.pendingApprovals.has(toolId)) {
          this.pendingApprovals.delete(toolId);
          resolve(false);
        }
      }, 60000);
    });
  }

  // === BUDGETED SYSTEM PROMPT: trim context by priority when prompt is too large ===
  private buildBudgetedSystemPrompt(): string {
    const MAX_CONTEXT_TOKENS = 3000;

    // Build session intent context (highest priority — never lose track of what user asked)
    const intentContext = this.sessionIntents.length > 0
      ? `\n## מה המשתמש ביקש בשיחה הזו (לא לשכוח!)\n${this.sessionIntents.map((intent, i) => `${i + 1}. ${intent}`).join('\n')}\nחשוב: תמיד תזכור את הבקשות האלה, גם אם חלק מהשיחה נחתך.\n`
      : '';

    const sections = [
      { key: 'time', content: '', priority: 10 },  // time is injected by buildSystemPrompt
      { key: 'intents', content: intentContext, priority: 9 },  // session intents — never trim
      { key: 'personality', content: this.personality.toContextString(), priority: 8 },
      { key: 'memory', content: this.memory.toContextString(), priority: 7 },
      { key: 'updates', content: updateAwareness.toContextString(), priority: 6 },
      { key: 'userProfile', content: this.userProfile.toContextString(), priority: 5 },
      { key: 'favorites', content: this.favorites.toContextString(), priority: 4 },
    ];

    const totalEstimate = sections.reduce((s, sec) => s + estimateTokens(sec.content), 0);

    if (totalEstimate > MAX_CONTEXT_TOKENS) {
      const { kept, dropped } = trimSystemContext(sections, MAX_CONTEXT_TOKENS);
      if (dropped.length > 0) {
        console.log(`[Agent] Prompt trimmed — dropped: ${dropped.join(', ')}`);
      }
      const contextMap: Record<string, string> = {};
      for (const s of kept) contextMap[s.key] = s.content;
      return buildSystemPrompt({
        userProfileContext: contextMap['userProfile'] || '',
        memoryContext: contextMap['memory'] || '',
        favoritesContext: contextMap['favorites'] || '',
        personalityContext: contextMap['personality'] || '',
        updateContext: contextMap['updates'] || '',
        sessionIntentsContext: contextMap['intents'] || '',
        liveMode: this.liveMode,
      });
    }

    // No trimming needed
    return buildSystemPrompt({
      userProfileContext: this.userProfile.toContextString(),
      memoryContext: this.memory.toContextString(),
      favoritesContext: this.favorites.toContextString(),
      personalityContext: this.personality.toContextString(),
      updateContext: updateAwareness.toContextString(),
      sessionIntentsContext: intentContext,
      liveMode: this.liveMode,
    });
  }

  resolveApproval(toolId: string, approved: boolean): void {
    const resolver = this.pendingApprovals.get(toolId);
    if (resolver) {
      this.pendingApprovals.delete(toolId);
      resolver(approved);
    }
  }

  // Called when client disconnects — auto-reject all pending approvals so the
  // agent loop unblocks and frees resources.
  cleanup(): void {
    for (const [toolId, resolver] of this.pendingApprovals.entries()) {
      try { resolver(false); } catch {}
      this.pendingApprovals.delete(toolId);
    }
  }

  setLiveMode(live: boolean): void {
    this.liveMode = live;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): MessageParam[] {
    return this.conversationHistory;
  }

  getConversationId(): string {
    return this.conversationId;
  }

  getConversationSnapshot(): { id: string; messages: { role: string; content: string }[] } {
    const messages = this.conversationHistory
      .filter(m => typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content as string }));
    return { id: this.conversationId, messages };
  }
}
