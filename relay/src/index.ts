import 'dotenv/config'; // load relay/.env (if present) before reading process.env
import http from 'node:http';
import crypto from 'node:crypto';
import { Relay } from './relay.js';

/**
 * Claude Remote cloud relay.
 *
 * Deploy this on a public host. Local servers dial out to it; the relay
 * reverse-proxies the mobile app's HTTP + WebSocket traffic to whichever local
 * server matches the `serverId` in the URL. One relay serves many servers.
 *
 *   App  ──HTTPS/WSS──▶  relay  ◀──WSS (dial-out)──  local server (behind NAT)
 *        /s/<serverId>/...                            127.0.0.1:8787 (loopback)
 *
 * Env:
 *   RELAY_PORT   (default 8080)
 *   RELAY_HOST   (default 0.0.0.0)
 *   RELAY_TOKEN  shared secret agents must present to register. Auto-generated
 *                if unset (printed on startup) — set it explicitly in prod.
 */
function main(): void {
  const port = Number(process.env.RELAY_PORT || 8080);
  const host = process.env.RELAY_HOST || '0.0.0.0';
  let relayToken = process.env.RELAY_TOKEN || '';
  if (!relayToken) {
    relayToken = crypto.randomBytes(24).toString('base64url');
    console.log('[relay] No RELAY_TOKEN set — generated an ephemeral one (set RELAY_TOKEN in production).');
  }

  const relay = new Relay({ relayToken });
  const server = http.createServer((req, res) => relay.handleRequest(req, res));
  server.on('upgrade', (req, socket, head) => relay.handleUpgrade(req, socket, head));

  const heartbeat = relay.startHeartbeat();

  server.listen(port, host, () => {
    console.log('───────────────────────────────────────────────');
    console.log('  Claude Remote relay is running');
    console.log(`  Listening on ${host}:${port}`);
    console.log(`  Agent endpoint:  wss://<this-host>/agent`);
    console.log(`  App URL form:    https://<this-host>/s/<serverId>`);
    console.log(`  RELAY_TOKEN:     ${relayToken}`);
    console.log('───────────────────────────────────────────────');
  });

  const shutdown = (sig: string) => {
    console.log(`[relay] ${sig}, shutting down…`);
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (e) => console.error('[relay] uncaughtException:', e));
  process.on('unhandledRejection', (e) => console.error('[relay] unhandledRejection:', e));
}

main();
