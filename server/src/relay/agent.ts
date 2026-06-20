import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('relay');

/**
 * Cloud-relay AGENT: an OPT-IN, dial-out bridge that lets the app reach this
 * server without sharing a LAN. It does NOT touch the LAN gateway/REST — it just
 * opens a persistent control socket to the relay and replays whatever the relay
 * forwards onto this server's own loopback listener (127.0.0.1), so every
 * existing handler (auth, WS, REST, file downloads) is reused verbatim.
 *
 * The app then connects to `<relayUrl>/s/<serverId>` exactly as if it were the
 * server's address. LAN connections keep working unchanged and in parallel.
 */

// --- Mirror of relay/src/protocol.ts (kept in sync by hand) ----------------
type RelayToAgent =
  | { t: 'registered' }
  | { t: 'register_error'; message: string }
  | { t: 'req'; streamId: string; method: string; path: string; headers: Record<string, string>; body?: string }
  | { t: 'ws_open'; streamId: string; path: string }
  | { t: 'ws_msg'; streamId: string; data: string }
  | { t: 'ws_close'; streamId: string }
  | { t: 'cancel'; streamId: string };

type AgentToRelay =
  | { t: 'register'; serverId: string; keyHash: string; name?: string }
  | { t: 'res'; streamId: string; status: number; headers: Record<string, string> }
  | { t: 'res_chunk'; streamId: string; data: string }
  | { t: 'res_end'; streamId: string }
  | { t: 'res_error'; streamId: string; message: string }
  | { t: 'ws_msg'; streamId: string; data: string }
  | { t: 'ws_close'; streamId: string };

const RES_CHUNK_BYTES = 256 * 1024;

/** A loopback WebSocket proxying one app socket, with a buffer for frames that
 *  arrive before the loopback connection finishes opening. */
interface ProxiedSocket {
  ws: WebSocket;
  open: boolean;
  buffer: string[];
}

export function startRelayAgent(cfg: AppConfig): void {
  if (!cfg.relay?.enabled || !cfg.relay.url || !cfg.relay.serverId) return;

  const keyHash = crypto.createHash('sha256').update(cfg.token).digest('hex');
  const wsBase = cfg.relay.url.replace(/^http/i, 'ws').replace(/\/+$/, '');
  const loopbackHttp = `http://127.0.0.1:${cfg.port}`;
  const loopbackWs = `ws://127.0.0.1:${cfg.port}`;
  const name = cfg.relay.name;

  let ws: WebSocket | null = null;
  let attempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let closed = false;
  const sockets = new Map<string, ProxiedSocket>();
  const cancelled = new Set<string>();

  const send = (msg: AgentToRelay) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const handleReq = async (m: Extract<RelayToAgent, { t: 'req' }>) => {
    try {
      const res = await fetch(loopbackHttp + m.path, {
        method: m.method,
        headers: m.headers,
        body: m.body != null ? Buffer.from(m.body, 'base64') : undefined,
      });
      if (cancelled.has(m.streamId)) {
        cancelled.delete(m.streamId);
        return;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      send({ t: 'res', streamId: m.streamId, status: res.status, headers });
      const buf = Buffer.from(await res.arrayBuffer());
      for (let i = 0; i < buf.length; i += RES_CHUNK_BYTES) {
        if (cancelled.has(m.streamId)) break;
        send({ t: 'res_chunk', streamId: m.streamId, data: buf.subarray(i, i + RES_CHUNK_BYTES).toString('base64') });
      }
      if (cancelled.has(m.streamId)) cancelled.delete(m.streamId);
      else send({ t: 'res_end', streamId: m.streamId });
    } catch (e) {
      cancelled.delete(m.streamId);
      send({ t: 'res_error', streamId: m.streamId, message: (e as Error).message });
    }
  };

  const openSocket = (m: Extract<RelayToAgent, { t: 'ws_open' }>) => {
    const lws = new WebSocket(loopbackWs + m.path);
    const ps: ProxiedSocket = { ws: lws, open: false, buffer: [] };
    sockets.set(m.streamId, ps);
    lws.on('open', () => {
      ps.open = true;
      for (const data of ps.buffer) lws.send(data);
      ps.buffer = [];
    });
    lws.on('message', (data) => send({ t: 'ws_msg', streamId: m.streamId, data: data.toString() }));
    lws.on('close', () => {
      if (sockets.delete(m.streamId)) send({ t: 'ws_close', streamId: m.streamId });
    });
    lws.on('error', (err) => log.warn('loopback ws error:', err.message));
  };

  const closeSocket = (streamId: string) => {
    const ps = sockets.get(streamId);
    if (ps) {
      sockets.delete(streamId);
      try {
        ps.ws.close();
      } catch {
        /* ignore */
      }
    }
  };

  const onMessage = (raw: Buffer) => {
    let m: RelayToAgent;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (m.t) {
      case 'registered':
        log.info(`Connected to relay. App URL: ${cfg.relay!.url.replace(/\/+$/, '')}/s/${cfg.relay!.serverId}`);
        break;
      case 'register_error':
        log.error('Relay rejected registration:', m.message);
        break;
      case 'req':
        void handleReq(m);
        break;
      case 'ws_open':
        openSocket(m);
        break;
      case 'ws_msg': {
        const ps = sockets.get(m.streamId);
        if (ps) {
          if (ps.open) ps.ws.send(m.data);
          else ps.buffer.push(m.data);
        }
        break;
      }
      case 'ws_close':
        closeSocket(m.streamId);
        break;
      case 'cancel':
        cancelled.add(m.streamId);
        break;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(attempts, 5), 30_000);
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect(): void {
    if (closed) return;
    const url = `${wsBase}/agent?token=${encodeURIComponent(cfg.relay!.token)}`;
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch (e) {
      log.warn('relay connect failed:', (e as Error).message);
      scheduleReconnect();
      return;
    }
    ws = sock;

    sock.on('open', () => {
      attempts = 0;
      log.info(`Dialed relay ${wsBase} as serverId=${cfg.relay!.serverId}`);
      send({ t: 'register', serverId: cfg.relay!.serverId, keyHash, name });
    });
    sock.on('message', onMessage);
    sock.on('close', () => {
      ws = null;
      for (const id of [...sockets.keys()]) closeSocket(id);
      if (!closed) {
        log.warn('Relay connection closed; reconnecting…');
        scheduleReconnect();
      }
    });
    sock.on('error', (err) => log.warn('relay socket error:', err.message));
  }

  log.info('Cloud relay enabled — dialing out (LAN access is unaffected).');
  connect();

  const stop = () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
