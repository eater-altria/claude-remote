import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { AppConfig } from '../config.js';
import type { SessionManager } from '../claude/manager.js';
import type { ClientMessage, ServerMessage } from '../protocol.js';
import { createLogger } from '../logger.js';

const log = createLogger('ws');

export function attachGateway(httpServer: HttpServer, cfg: AppConfig, manager: SessionManager) {
  const wss = new WebSocketServer({ noServer: true });

  // sessionId -> set of sockets attached to it
  const subscribers = new Map<string, Set<WebSocket>>();
  // socket -> set of sessionIds
  const attachments = new WeakMap<WebSocket, Set<string>>();

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (sessionId: string, msg: ServerMessage) => {
    const subs = subscribers.get(sessionId);
    if (!subs) return;
    for (const ws of subs) send(ws, msg);
  };

  /** Send to every connected client, regardless of session attachment. */
  const broadcastAll = (msg: ServerMessage) => {
    for (const ws of wss.clients) send(ws, msg);
  };

  // --- Forward manager events to subscribed clients ------------------------
  manager.on('event', (sessionId, event) => broadcast(sessionId, { t: 'event', sessionId, event }));
  manager.on('state', (sessionId, meta) => broadcast(sessionId, { t: 'session_state', sessionId, meta }));
  manager.on('permission_request', (sessionId, request) => broadcast(sessionId, { t: 'permission_request', sessionId, request }));
  manager.on('permission_resolved', (sessionId, r) =>
    broadcast(sessionId, { t: 'permission_resolved', sessionId, requestId: r.requestId, decision: r.decision }),
  );
  manager.on('question_request', (sessionId, request) => broadcast(sessionId, { t: 'question_request', sessionId, request }));
  manager.on('question_resolved', (sessionId, r) =>
    broadcast(sessionId, { t: 'question_resolved', sessionId, requestId: r.requestId }),
  );
  manager.on('capabilities', (sessionId, capabilities) => broadcast(sessionId, { t: 'capabilities', sessionId, capabilities }));
  manager.on('transcript_reset', (sessionId, meta) => broadcast(sessionId, { t: 'transcript_reset', sessionId, meta }));

  // --- Global notification alerts (→ on-device local notifications) ---------
  // Broadcast to ALL clients so a phone is alerted about any session that needs
  // it, even one it hasn't opened. This replaces the old server→FCM push relay;
  // delivery only reaches phones whose app is alive with a live socket.
  const prevState = new Map<string, string>();
  manager.on('permission_request', (sessionId, request) => {
    const meta = manager.getMeta(sessionId);
    broadcastAll({
      t: 'alert',
      sessionId,
      kind: 'permission',
      requestId: request.requestId,
      categoryId: 'approval',
      title: `${meta?.title ?? 'Claude'} · needs approval`,
      body: request.detail || request.title || 'A tool wants to run.',
    });
  });
  manager.on('question_request', (sessionId, request) => {
    const meta = manager.getMeta(sessionId);
    const q = request.questions?.[0];
    broadcastAll({
      t: 'alert',
      sessionId,
      kind: 'question',
      requestId: request.requestId,
      title: `${meta?.title ?? 'Claude'} · has a question`,
      body: q?.question || 'Tap to answer.',
    });
  });
  manager.on('state', (sessionId, meta) => {
    const prev = prevState.get(sessionId);
    prevState.set(sessionId, meta.state);
    if ((prev === 'running' || prev === 'starting') && meta.state === 'idle') {
      broadcastAll({
        t: 'alert',
        sessionId,
        kind: 'done',
        title: `${meta.title} · done`,
        body: 'Claude finished this turn.',
      });
    }
  });

  // --- HTTP upgrade with token auth ----------------------------------------
  httpServer.on('upgrade', (req, socket, head) => {
    let token: string | null = null;
    try {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      token = url.searchParams.get('token');
    } catch {
      socket.destroy();
      return;
    }
    if (token !== cfg.token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // --- Connection handling -------------------------------------------------
  wss.on('connection', (ws: WebSocket) => {
    attachments.set(ws, new Set());
    send(ws, { t: 'hello', protocol: 1, version: '1.0.0' });

    const attach = async (sessionId: string) => {
      const s = await manager.ensureLive(sessionId);
      const meta = manager.getMeta(sessionId);
      if (!s || !meta) {
        send(ws, { t: 'error', sessionId, message: 'Session not found' });
        return;
      }
      let subs = subscribers.get(sessionId);
      if (!subs) subscribers.set(sessionId, (subs = new Set()));
      subs.add(ws);
      attachments.get(ws)!.add(sessionId);

      send(ws, { t: 'attached', sessionId, meta });
      send(ws, { t: 'backlog', sessionId, events: s.getBacklog(), meta });
      const caps = s.getCapabilities() ?? manager.getCapabilities();
      if (caps) send(ws, { t: 'capabilities', sessionId, capabilities: caps });
      // Replay any outstanding prompts so a reconnecting client can respond.
      for (const req of s.getOpenPermissionRequests()) send(ws, { t: 'permission_request', sessionId, request: req });
      for (const req of s.getOpenQuestionRequests()) send(ws, { t: 'question_request', sessionId, request: req });
    };

    const detach = (sessionId: string) => {
      subscribers.get(sessionId)?.delete(ws);
      attachments.get(ws)?.delete(sessionId);
    };

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { t: 'error', message: 'Invalid JSON' });
        return;
      }
      try {
        switch (msg.t) {
          case 'ping':
            send(ws, { t: 'pong' });
            break;
          case 'attach':
            await attach(msg.sessionId);
            break;
          case 'detach':
            detach(msg.sessionId);
            break;
          case 'user_message': {
            const ok = await manager.sendUserMessage(msg.sessionId, msg.text, msg.images);
            if (!ok) send(ws, { t: 'error', sessionId: msg.sessionId, message: 'Session not found' });
            break;
          }
          case 'permission_response':
            await manager.respondPermission(msg.sessionId, msg.requestId, msg.decision, msg.remember ?? false);
            break;
          case 'question_response':
            await manager.respondQuestion(msg.sessionId, msg.requestId, msg.answer);
            break;
          case 'interrupt':
            await manager.interrupt(msg.sessionId);
            break;
          case 'set_permission_mode':
            await manager.setMode(msg.sessionId, msg.mode);
            break;
          case 'set_model':
            await manager.setModel(msg.sessionId, msg.model);
            break;
          case 'set_effort':
            await manager.setEffort(msg.sessionId, msg.effort);
            break;
          case 'get_context': {
            let data = null;
            let error: string | undefined;
            try {
              data = await manager.getContextUsage(msg.sessionId);
            } catch (e) {
              error = (e as Error).message;
            }
            send(ws, { t: 'info_result', sessionId: msg.sessionId, requestId: msg.requestId, kind: 'context', ok: !!data, context: data ?? undefined, error: data ? undefined : error ?? 'Context usage unavailable' });
            break;
          }
          case 'get_usage': {
            let data = null;
            let error: string | undefined;
            try {
              data = await manager.getUsage(msg.sessionId);
            } catch (e) {
              error = (e as Error).message;
            }
            send(ws, { t: 'info_result', sessionId: msg.sessionId, requestId: msg.requestId, kind: 'usage', ok: !!data, usage: data ?? undefined, error: data ? undefined : error ?? 'Usage unavailable' });
            break;
          }
          default:
            send(ws, { t: 'error', message: `Unknown message type` });
        }
      } catch (e) {
        log.warn('client message error:', (e as Error).message);
        send(ws, { t: 'error', message: (e as Error).message });
      }
    });

    ws.on('close', () => {
      const ids = attachments.get(ws);
      if (ids) for (const id of ids) subscribers.get(id)?.delete(ws);
      attachments.delete(ws);
    });

    ws.on('error', (e) => log.warn('socket error:', e.message));
  });

  // --- Heartbeat: drop dead sockets ---------------------------------------
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
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
  }, 30000);
  wss.on('connection', (ws) => {
    (ws as any).isAlive = true;
    ws.on('pong', () => ((ws as any).isAlive = true));
  });
  wss.on('close', () => clearInterval(interval));

  return wss;
}
