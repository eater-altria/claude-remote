import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentToRelay, RelayToAgent } from './protocol.js';

const HTTP_STREAM_TIMEOUT_MS = 120_000;

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newId(): string {
  return crypto.randomBytes(9).toString('base64url');
}

/** A connected local server. One per serverId. */
interface Agent {
  ws: WebSocket;
  serverId: string;
  keyHash: string;
  name?: string;
  /** In-flight HTTP responses awaiting tunneled data, by streamId. */
  http: Map<string, { res: http.ServerResponse; timer: NodeJS.Timeout }>;
  /** Live proxied app WebSockets, by streamId. */
  sockets: Map<string, WebSocket>;
}

export interface RelayOptions {
  /** Shared secret an agent must present (?token=) to register. */
  relayToken: string;
}

export class Relay {
  private agents = new Map<string, Agent>();
  private agentWss = new WebSocketServer({ noServer: true });
  private clientWss = new WebSocketServer({ noServer: true });

  constructor(private opts: RelayOptions) {
    this.agentWss.on('connection', (ws) => this.onAgentConnection(ws));
  }

  // -------------------------------------------------------------------------
  // HTTP: health + reverse proxy for /s/:serverId/*
  // -------------------------------------------------------------------------
  handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', 'http://relay');
    if (url.pathname === '/healthz' || url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'claude-remote-relay', servers: this.agents.size }));
      return;
    }

    const match = url.pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
    if (!match) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `No route for ${url.pathname}. The app's server URL must be <relay>/s/<serverId> (e.g. http://host:8080/s/home-mac).`,
        }),
      );
      return;
    }
    const serverId = decodeURIComponent(match[1]);
    const rest = (match[2] || '/') + (url.search || '');

    const agent = this.agents.get(serverId);
    if (!agent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server offline (no agent connected for this id).' }));
      return;
    }
    const token = this.extractToken(req, url);
    if (!token || sha256(token) !== agent.keyHash) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('error', () => res.destroy());
    req.on('end', () => {
      if (res.writableEnded) return;
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const streamId = newId();
      const timer = setTimeout(() => {
        if (agent.http.delete(streamId)) {
          this.toAgent(agent, { t: 'cancel', streamId });
          if (!res.headersSent) res.writeHead(504, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream timed out' }));
        }
      }, HTTP_STREAM_TIMEOUT_MS);
      agent.http.set(streamId, { res, timer });
      res.on('close', () => {
        const e = agent.http.get(streamId);
        if (e) {
          clearTimeout(e.timer);
          agent.http.delete(streamId);
          this.toAgent(agent, { t: 'cancel', streamId });
        }
      });
      this.toAgent(agent, {
        t: 'req',
        streamId,
        method: req.method || 'GET',
        path: rest,
        headers: this.forwardHeaders(req.headers),
        body: body ? body.toString('base64') : undefined,
      });
    });
  }

  // -------------------------------------------------------------------------
  // WebSocket upgrades: /agent (control) and /s/:serverId/ws (proxied)
  // -------------------------------------------------------------------------
  handleUpgrade(req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    let url: URL;
    try {
      url = new URL(req.url || '/', 'http://relay');
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname === '/agent') {
      if (url.searchParams.get('token') !== this.opts.relayToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.agentWss.handleUpgrade(req, socket, head, (ws) => this.agentWss.emit('connection', ws, req));
      return;
    }

    const match = url.pathname.match(/^\/s\/([^/]+)\/ws$/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const agent = this.agents.get(serverId);
      if (!agent) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
        return;
      }
      const token = url.searchParams.get('token');
      if (!token || sha256(token) !== agent.keyHash) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.clientWss.handleUpgrade(req, socket, head, (ws) => {
        this.onClientSocket(agent, ws, '/ws' + (url.search || ''));
      });
      return;
    }

    socket.destroy();
  }

  // -------------------------------------------------------------------------
  // Agent (local server) control channel
  // -------------------------------------------------------------------------
  private onAgentConnection(ws: WebSocket): void {
    let agent: Agent | null = null;
    (ws as any).isAlive = true;
    ws.on('pong', () => ((ws as any).isAlive = true));

    ws.on('message', (raw) => {
      let msg: AgentToRelay;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.t === 'register') {
        if (!msg.serverId || !msg.keyHash) {
          this.send(ws, { t: 'register_error', message: 'serverId and keyHash required' });
          ws.close();
          return;
        }
        // Replace any stale agent for this id (e.g. server restarted).
        const existing = this.agents.get(msg.serverId);
        if (existing && existing.ws !== ws) existing.ws.close();
        agent = { ws, serverId: msg.serverId, keyHash: msg.keyHash, name: msg.name, http: new Map(), sockets: new Map() };
        this.agents.set(msg.serverId, agent);
        this.send(ws, { t: 'registered' });
        console.log(`[relay] agent registered: ${msg.serverId}${msg.name ? ` (${msg.name})` : ''}`);
        return;
      }

      if (!agent) return; // ignore everything until registered

      switch (msg.t) {
        case 'res': {
          const e = agent.http.get(msg.streamId);
          if (e && !e.res.headersSent) e.res.writeHead(msg.status, this.responseHeaders(msg.headers));
          break;
        }
        case 'res_chunk': {
          const e = agent.http.get(msg.streamId);
          if (e) e.res.write(Buffer.from(msg.data, 'base64'));
          break;
        }
        case 'res_end': {
          const e = agent.http.get(msg.streamId);
          if (e) {
            clearTimeout(e.timer);
            agent.http.delete(msg.streamId);
            e.res.end();
          }
          break;
        }
        case 'res_error': {
          const e = agent.http.get(msg.streamId);
          if (e) {
            clearTimeout(e.timer);
            agent.http.delete(msg.streamId);
            if (!e.res.headersSent) e.res.writeHead(502, { 'content-type': 'application/json' });
            e.res.end(JSON.stringify({ error: msg.message || 'Upstream error' }));
          }
          break;
        }
        case 'ws_msg': {
          const sock = agent.sockets.get(msg.streamId);
          if (sock && sock.readyState === WebSocket.OPEN) sock.send(msg.data);
          break;
        }
        case 'ws_close': {
          const sock = agent.sockets.get(msg.streamId);
          if (sock) {
            agent.sockets.delete(msg.streamId);
            try {
              sock.close();
            } catch {
              /* ignore */
            }
          }
          break;
        }
      }
    });

    const teardown = () => {
      if (!agent) return;
      if (this.agents.get(agent.serverId)?.ws === ws) this.agents.delete(agent.serverId);
      for (const { res, timer } of agent.http.values()) {
        clearTimeout(timer);
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
        if (!res.writableEnded) res.end(JSON.stringify({ error: 'Server disconnected' }));
      }
      for (const sock of agent.sockets.values()) {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
      console.log(`[relay] agent gone: ${agent.serverId}`);
      agent = null;
    };
    ws.on('close', teardown);
    ws.on('error', teardown);
  }

  // -------------------------------------------------------------------------
  // Proxied app WebSocket
  // -------------------------------------------------------------------------
  private onClientSocket(agent: Agent, ws: WebSocket, path: string): void {
    const streamId = newId();
    agent.sockets.set(streamId, ws);
    this.toAgent(agent, { t: 'ws_open', streamId, path });

    ws.on('message', (raw) => this.toAgent(agent, { t: 'ws_msg', streamId, data: raw.toString() }));
    const close = () => {
      if (agent.sockets.delete(streamId)) this.toAgent(agent, { t: 'ws_close', streamId });
    };
    ws.on('close', close);
    ws.on('error', close);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private extractToken(req: http.IncomingMessage, url: URL): string | null {
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
    return url.searchParams.get('token');
  }

  /** Headers forwarded from app→server. Drop hop-by-hop / host so the agent's
   *  loopback fetch sets them correctly. */
  private forwardHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
    const out: Record<string, string> = {};
    const allow = ['authorization', 'content-type', 'accept'];
    for (const k of allow) {
      const v = h[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  /** Response headers forwarded server→app. Keep content-type / disposition;
   *  drop transfer-encoding/content-length (we re-chunk). */
  private responseHeaders(h: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      const lk = k.toLowerCase();
      if (lk === 'content-type' || lk === 'content-disposition' || lk === 'cache-control') out[lk] = v;
    }
    return out;
  }

  private send(ws: WebSocket, msg: RelayToAgent): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  private toAgent(agent: Agent, msg: RelayToAgent): void {
    this.send(agent.ws, msg);
  }

  /** Drop control sockets that stopped answering pings. */
  startHeartbeat(): NodeJS.Timeout {
    return setInterval(() => {
      for (const ws of this.agentWss.clients) {
        if ((ws as any).isAlive === false) {
          ws.terminate();
          continue;
        }
        (ws as any).isAlive = false;
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, 30_000);
  }
}
