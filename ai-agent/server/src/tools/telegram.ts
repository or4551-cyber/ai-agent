export async function sendTelegram(
  message: string,
  chatId?: string
): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token) return 'Error: Telegram not configured. Set TELEGRAM_BOT_TOKEN in .env';
  if (!targetChatId) return 'Error: No chat ID provided. Set TELEGRAM_CHAT_ID in .env or provide chat_id.';

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });

  const data = await res.json();
  if (data.ok) {
    return `Telegram message sent to chat ${targetChatId}`;
  } else {
    return `Telegram error: ${data.description}`;
  }
}
