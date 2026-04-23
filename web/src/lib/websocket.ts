export type WSEventType =
  | 'text_delta'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'message_done'
  | 'error'
  | 'approval_request'
  | 'connection';

export interface WSEvent {
  type: WSEventType;
  payload: Record<string, unknown>;
}

export class AgentWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private listeners: Map<string, Set<(event: WSEvent) => void>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get connected() {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const separator = this.url.includes('?') ? '&' : '?';
    this.ws = new WebSocket(`${this.url}${separator}token=${this.token}`);

    this.ws.onopen = () => {
      this._connected = true;
      this.emit('connection', { type: 'connection', payload: { status: 'connected' } });
    };

    this.ws.onmessage = (event) => {
      try {
        const data: WSEvent = JSON.parse(event.data);
        this.emit(data.type, data);
        this.emit('*', data);
      } catch {
        console.error('Failed to parse WS message');
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.emit('connection', { type: 'connection', payload: { status: 'disconnected' } } as unknown as WSEvent);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._connected = false;
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  send(type: string, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  sendMessage(message: string): void {
    this.send('chat', { message });
  }

  approveAction(id: string, approved: boolean): void {
    this.send('approval_response', { id, approved });
  }

  clearHistory(): void {
    this.send('clear_history', {});
  }

  on(event: string, callback: (event: WSEvent) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: WSEvent): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }
}
