import { ClaudeAgent } from '../agent/claude-agent';
import { WSResponse } from '../types';

const POLL_INTERVAL = 3000; // 3 seconds

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    photo?: any[];
    voice?: any;
    document?: any;
  };
}

export class TelegramBotService {
  private token: string;
  private allowedChatIds: Set<string>;
  private running = false;
  private lastUpdateId = 0;
  private agent: ClaudeAgent | null = null;
  private apiKey: string;
  private responseBuffer = '';

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';

    // Allowed chat IDs — comma separated in .env
    const ids = process.env.TELEGRAM_CHAT_ID || '';
    this.allowedChatIds = new Set(ids.split(',').map(s => s.trim()).filter(Boolean));
  }

  isConfigured(): boolean {
    return !!(this.token && this.apiKey && this.allowedChatIds.size > 0);
  }

  start(): void {
    if (!this.isConfigured()) {
      console.log('[TelegramBot] Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
      return;
    }

    if (this.running) return;
    this.running = true;
    console.log('[TelegramBot] ✅ Starting long-polling...');
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.agent) {
      this.agent.cleanup();
      this.agent = null;
    }
    console.log('[TelegramBot] Stopped');
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          await this.handleUpdate(update);
          this.lastUpdateId = update.update_id;
        }
      } catch (err) {
        console.error('[TelegramBot] Poll error:', (err as Error).message);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=10&allowed_updates=["message"]`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data: any = await resp.json();
    if (!data.ok) return [];
    return data.result || [];
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id.toString();
    const userName = msg.from?.first_name || 'User';

    // Security: only respond to allowed chat IDs
    if (!this.allowedChatIds.has(chatId)) {
      console.log(`[TelegramBot] Ignored message from unauthorized chat: ${chatId}`);
      await this.sendMessage(chatId, '⛔ אני מגיב רק לצ\'אטים מורשים.');
      return;
    }

    const userText = msg.text.trim();
    console.log(`[TelegramBot] ${userName}: ${userText.substring(0, 100)}`);

    // Special commands
    if (userText === '/start') {
      await this.sendMessage(chatId, `שלום ${userName}! 🧙‍♂️\nאני מרלין — העוזר האישי שלך.\nכתוב לי כל דבר ואני אטפל בזה.`);
      return;
    }

    if (userText === '/status') {
      await this.sendMessage(chatId, '✅ מרלין פעיל ומחובר.');
      return;
    }

    // Process with Claude agent
    try {
      this.responseBuffer = '';

      // Create a fresh agent per conversation turn (or reuse)
      if (!this.agent) {
        this.agent = new ClaudeAgent(this.apiKey, (event: WSResponse) => {
          this.handleAgentEvent(event);
        });
      }

      // Send "typing" indicator
      await this.sendTyping(chatId);

      await this.agent.processMessage(userText);

      // Send accumulated response
      if (this.responseBuffer.trim()) {
        // Split long messages (Telegram limit: 4096 chars)
        const chunks = this.splitMessage(this.responseBuffer.trim());
        for (const chunk of chunks) {
          await this.sendMessage(chatId, chunk);
        }
      }
    } catch (err) {
      console.error('[TelegramBot] Agent error:', (err as Error).message);
      await this.sendMessage(chatId, `❌ שגיאה: ${(err as Error).message}`);
    }
  }

  private handleAgentEvent(event: WSResponse): void {
    switch (event.type) {
      case 'text_delta':
        if (event.payload.text) {
          this.responseBuffer += event.payload.text;
        }
        break;
      case 'tool_call_start':
        this.responseBuffer += `\n🔧 ${event.payload.name}...\n`;
        break;
      case 'tool_call_end':
        // Don't dump raw tool output — agent will summarize
        break;
    }
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      // Retry without Markdown if parse fails
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    }
  }

  private async sendTyping(chatId: string): Promise<void> {
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }

  private splitMessage(text: string, maxLen = 4000): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      // Try to split at newline
      let splitIdx = remaining.lastIndexOf('\n', maxLen);
      if (splitIdx < maxLen / 2) splitIdx = maxLen;
      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trim();
    }
    return chunks;
  }
}
