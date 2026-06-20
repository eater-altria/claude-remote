import 'dotenv/config'; // load server/.env (if present) before anything reads process.env
import http from 'node:http';
import os from 'node:os';
import { loadConfig } from './config.js';
import { SessionManager } from './claude/manager.js';
import { buildApp } from './http/rest.js';
import { attachGateway } from './ws/gateway.js';
import { startRelayAgent } from './relay/agent.js';
import { createLogger } from './logger.js';

const log = createLogger('main');

function localIPs(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function main() {
  const cfg = loadConfig();
  const manager = new SessionManager(cfg);
  const app = buildApp(cfg, manager);
  const server = http.createServer(app);
  attachGateway(server, cfg, manager);

  server.listen(cfg.port, cfg.host, () => {
    const ips = localIPs();
    log.info('───────────────────────────────────────────────');
    log.info('  Claude Remote server is running');
    log.info(`  Listening on ${cfg.host}:${cfg.port}`);
    log.info(`  claude binary: ${cfg.claudePath ?? 'SDK bundled'}`);
    log.info(`  data dir:      ${cfg.dataDir}`);
    log.info('  Connect the app to one of:');
    for (const ip of ips) log.info(`    http://${ip}:${cfg.port}`);
    log.info(`    http://127.0.0.1:${cfg.port}`);
    if (cfg.relay?.enabled && cfg.relay.url && cfg.relay.serverId) {
      log.info(`    ${cfg.relay.url}/s/${cfg.relay.serverId}  (via cloud relay)`);
    }
    log.info(`  Access token:  ${cfg.token}`);
    log.info('───────────────────────────────────────────────');

    // Dial out to the cloud relay once the loopback listener is up (the agent
    // replays relayed traffic onto 127.0.0.1). No-op unless relay.enabled.
    startRelayAgent(cfg);
  });

  const shutdown = (sig: string) => {
    log.info(`Received ${sig}, shutting down…`);
    manager.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (e) => log.error('uncaughtException:', e));
  process.on('unhandledRejection', (e) => log.error('unhandledRejection:', e));
}

main();
