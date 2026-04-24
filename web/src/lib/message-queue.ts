const QUEUE_KEY = 'ai-agent-message-queue';

export interface QueuedMessage {
  id: string;
  message: string;
  timestamp: number;
}

export function enqueueMessage(message: string): void {
  const queue = getQueue();
  queue.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    message,
    timestamp: Date.now(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function dequeueMessage(): QueuedMessage | null {
  const queue = getQueue();
  if (queue.length === 0) return null;
  const msg = queue.shift()!;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return msg;
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function getQueueSize(): number {
  return getQueue().length;
}
