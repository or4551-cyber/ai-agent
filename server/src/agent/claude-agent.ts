import Anthropic from '@anthropic-ai/sdk';
import { getToolDefinitions, getDangerLevel } from '../tools/definitions';
import { executeTool } from './tool-executor';
import { SYSTEM_PROMPT } from './system-prompt';
import { WSResponse } from '../types';
import { AgentMemory } from './memory';

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
  private usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };

  // Pricing per million tokens (Sonnet 4)
  private static PRICING: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  };

  constructor(
    apiKey: string,
    onEvent: (event: WSResponse) => void,
    model = 'claude-sonnet-4-20250514'
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.onEvent = onEvent;
    this.memory = new AgentMemory();
  }

  async processMessage(
    userMessage: string,
    images?: { base64: string; mediaType: string }[]
  ): Promise<string> {
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

    this.conversationHistory.push({
      role: 'user',
      content: userContent,
    });

    let finalText = '';
    let continueLoop = true;

    while (continueLoop) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT + this.memory.toContextString(),
        tools: getToolDefinitions() as Anthropic.Tool[],
        messages: this.conversationHistory as Anthropic.MessageParam[],
      });

      // Track usage
      const inTok = response.usage?.input_tokens || 0;
      const outTok = response.usage?.output_tokens || 0;
      this.usage.inputTokens += inTok;
      this.usage.outputTokens += outTok;
      const pricing = ClaudeAgent.PRICING[this.model] || { input: 3, output: 15 };
      const msgCost = (inTok * pricing.input + outTok * pricing.output) / 1_000_000;
      this.usage.totalCost += msgCost;

      this.onEvent({
        type: 'usage_update' as any,
        payload: {
          inputTokens: inTok,
          outputTokens: outTok,
          messageCost: Math.round(msgCost * 100000) / 100000,
          totalInputTokens: this.usage.inputTokens,
          totalOutputTokens: this.usage.outputTokens,
          totalCost: Math.round(this.usage.totalCost * 100000) / 100000,
        },
      });

      // Process content blocks
      const assistantContent: ContentBlock[] = [];
      const toolResults: ContentBlock[] = [];
      continueLoop = false;

      for (const block of response.content) {
        if (block.type === 'text') {
          finalText += block.text;
          assistantContent.push({ type: 'text', text: block.text });

          this.onEvent({
            type: 'text_delta',
            payload: { text: block.text },
          });
        } else if (block.type === 'tool_use') {
          continueLoop = true;
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });

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

          if (dangerLevel === 'dangerous') {
            approved = await this.requestApproval(block.id, block.name, block.input as Record<string, unknown>);
          }

          let result: string;
          if (approved) {
            const execResult = await executeTool(block.name, block.input as Record<string, unknown>);
            result = execResult.output;
          } else {
            result = 'Action cancelled by user.';
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
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
      if (response.stop_reason === 'end_turn' && !continueLoop) {
        continueLoop = false;
      }
    }

    this.onEvent({
      type: 'message_done',
      payload: { text: finalText },
    });

    return finalText;
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

  resolveApproval(toolId: string, approved: boolean): void {
    const resolver = this.pendingApprovals.get(toolId);
    if (resolver) {
      this.pendingApprovals.delete(toolId);
      resolver(approved);
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): MessageParam[] {
    return this.conversationHistory;
  }
}
