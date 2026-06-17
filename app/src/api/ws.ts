import type { ClientMessage, ServerMessage } from './protocol';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * Single multiplexed WebSocket to the server with automatic reconnect.
 * Re-attaches to all subscribed sessions whenever the socket reopens.
 */
export class WsConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private status: WsStatus = 'idle';
  private reconnectAttempts = 0;
  private shouldRun = false;
  private heartbeat: any = null;
  private reconnectTimer: any = null;

  private readonly subscriptions = new Set<string>();

  onMessage: (msg: ServerMessage) => void = () => {};
  onStatus: (status: WsStatus) => void = () => {};

  constructor(url: string) {
    this.url = url;
  }

  setUrl(url: string) {
    if (url === this.url) return;
    this.url = url;
    if (this.shouldRun) {
      this.stop();
      this.start();
    }
  }

  start() {
    this.shouldRun = true;
    this.connect();
  }

  stop() {
    this.shouldRun = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeat);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  private setStatus(s: WsStatus) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  private connect() {
    if (!this.shouldRun) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      // Re-attach to everything we were watching.
      for (const id of this.subscriptions) this.rawSend({ t: 'attach', sessionId: id });
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.rawSend({ t: 'ping' }), 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMessage;
        this.onMessage(msg);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onerror = () => {
      /* onclose will handle reconnect */
    };

    ws.onclose = () => {
      clearInterval(this.heartbeat);
      this.ws = null;
      if (this.shouldRun) this.scheduleReconnect();
      else this.setStatus('closed');
    };
  }

  private scheduleReconnect() {
    this.setStatus('connecting');
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts, 5), 15000);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private rawSend(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  send(msg: ClientMessage): boolean {
    return this.rawSend(msg);
  }

  attach(sessionId: string) {
    this.subscriptions.add(sessionId);
    this.rawSend({ t: 'attach', sessionId });
  }

  detach(sessionId: string) {
    this.subscriptions.delete(sessionId);
    this.rawSend({ t: 'detach', sessionId });
  }
}
