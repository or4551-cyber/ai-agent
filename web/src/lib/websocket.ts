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
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 999;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get reconnectAttempts() {
    return this._reconnectAttempts;
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
      this._reconnectAttempts = 0;
      this.emit('connection', { type: 'connection', payload: { status: 'connected' } });

      // Keepalive: send lightweight ping every 20s to prevent idle disconnect
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ type: 'ping', payload: {} })); } catch {}
        }
      }, 20000);
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
      if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
      this.emit('connection', { type: 'connection', payload: { status: 'disconnected' } } as unknown as WSEvent);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._connected = false;
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
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

  forceReconnect(): void {
    this._reconnectAttempts = 0;
    this.ws?.close();
    this.ws = null;
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      // Never truly give up — reset and keep trying
      this._reconnectAttempts = 0;
    }
    const delay = Math.min(1000 * Math.pow(1.3, this._reconnectAttempts), 15000);
    this._reconnectAttempts++;
    this.emit('connection', { type: 'connection', payload: { status: 'reconnecting', attempt: this._reconnectAttempts } } as unknown as WSEvent);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
