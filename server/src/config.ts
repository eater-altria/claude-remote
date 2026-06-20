import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from './logger.js';

const log = createLogger('config');

export interface AppConfig {
  host: string;
  port: number;
  /** Bearer token required on every HTTP request and the WS handshake. */
  token: string;
  /** Absolute path to the `claude` executable. */
  claudePath: string;
  /** Directory where session metadata + config live. */
  dataDir: string;
  /** SDK setting sources to load. [] = hermetic (default). */
  settingSources: SettingSource[];
  /** Default model id (null = account default). */
  defaultModel: string | null;
  /** Roots offered by the filesystem picker. */
  fsRoots: { name: string; path: string }[];
  /** Hard ceiling on how many live SDK queries we keep resident. */
  maxLiveSessions: number;
  /** Optional cloud-relay dial-out config (null = LAN only, the default). */
  relay: RelayConfig | null;
}

/** Cloud relay (server→relay dial-out) config. Entirely opt-in; when null the
 *  server behaves exactly as before and is reachable on the LAN only. */
export interface RelayConfig {
  /** Whether to actually dial out on startup. */
  enabled: boolean;
  /** Relay base URL, e.g. https://relay.example.com (ws/wss derived from it). */
  url: string;
  /** Shared secret the relay requires from agents (its RELAY_TOKEN). */
  token: string;
  /** Stable public id this server is reachable under: <relay>/s/<serverId>. */
  serverId: string;
  /** Optional human label shown in relay logs. */
  name?: string;
}

/** Resolve the optional cloud-relay config from env vars (highest priority) and a
 *  hand-written `relay` block in config.json. Returns null when relay was never
 *  configured (LAN-only, the default). Not persisted — env/.env is authoritative.
 *
 *  Env (all optional): CLAUDE_REMOTE_RELAY_URL · _RELAY_TOKEN · _RELAY_SERVER_ID
 *  · _RELAY_NAME · _RELAY_ENABLED (1/true/yes/on). */
function loadRelayConfig(persisted: Partial<RelayConfig> | null | undefined): RelayConfig | null {
  const e = process.env;
  const enabledEnv = e.CLAUDE_REMOTE_RELAY_ENABLED;
  const url = (e.CLAUDE_REMOTE_RELAY_URL || persisted?.url || '').trim().replace(/\/+$/, '');
  const token = e.CLAUDE_REMOTE_RELAY_TOKEN || persisted?.token || '';
  const name = e.CLAUDE_REMOTE_RELAY_NAME || persisted?.name;
  let serverId = e.CLAUDE_REMOTE_RELAY_SERVER_ID || persisted?.serverId || '';

  // Nothing configured anywhere → stay LAN-only and keep config.json tidy.
  if (!url && !token && !serverId && !persisted && enabledEnv == null) return null;

  const enabled =
    enabledEnv != null ? /^(1|true|yes|on)$/i.test(enabledEnv) : persisted?.enabled ?? Boolean(url);

  // The serverId is the app-facing address (<relay>/s/<serverId>), so it must be
  // stable. We don't persist it (config.json isn't rewritten), so derive a stable
  // default from the hostname instead of a random id. Override with
  // CLAUDE_REMOTE_RELAY_SERVER_ID for a custom value.
  if (!serverId && url) {
    const slug = os
      .hostname()
      .toLowerCase()
      .replace(/\.local$/, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    serverId = slug || crypto.createHash('sha256').update(os.hostname() || 'server').digest('base64url').slice(0, 12);
    log.info(`Using relay serverId "${serverId}" (from hostname; set CLAUDE_REMOTE_RELAY_SERVER_ID to override).`);
  }

  return { enabled, url, token, serverId, name };
}

function findClaude(): string {
  // 1. Explicit override.
  if (process.env.CLAUDE_REMOTE_CLAUDE_PATH) return process.env.CLAUDE_REMOTE_CLAUDE_PATH;
  // 2. Common install locations.
  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(os.homedir(), '.claude/local/claude'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  // 3. PATH lookup.
  try {
    const which = process.platform === 'win32' ? 'where claude' : 'command -v claude';
    const out = execSync(which, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out) return out;
  } catch {
    /* ignore */
  }
  // 4. Bundled with the SDK (let the SDK resolve it).
  try {
    const require = createRequire(import.meta.url);
    require.resolve('@anthropic-ai/claude-agent-sdk');
  } catch {
    /* ignore */
  }
  log.warn('Could not locate the `claude` executable; falling back to "claude" on PATH.');
  return 'claude';
}

function defaultRoots(): { name: string; path: string }[] {
  const home = os.homedir();
  const roots: { name: string; path: string }[] = [{ name: 'Home', path: home }];
  for (const sub of ['projects', 'Projects', 'Documents', 'Developer', 'code', 'src', 'workspace']) {
    const p = path.join(home, sub);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) roots.push({ name: sub, path: p });
    } catch {
      /* ignore */
    }
  }
  roots.push({ name: process.platform === 'win32' ? 'C:\\' : 'Filesystem root', path: process.platform === 'win32' ? 'C:\\' : '/' });
  return roots;
}

/** Expand a leading `~` to the home dir. dotenv does NOT do shell expansion, so a
 *  `CLAUDE_REMOTE_DATA_DIR=~/.claude-remote` in a .env would otherwise create a
 *  literal `~` directory under the cwd. */
function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadConfig(): AppConfig {
  const dataDir = expandHome(process.env.CLAUDE_REMOTE_DATA_DIR || path.join(os.homedir(), '.claude-remote'));
  fs.mkdirSync(dataDir, { recursive: true });

  const configPath = path.join(dataDir, 'config.json');
  let persisted: Partial<AppConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      log.warn('Failed to parse config.json, ignoring:', (e as Error).message);
    }
  }

  // Token: env > persisted > freshly generated.
  let token = process.env.CLAUDE_REMOTE_TOKEN || persisted.token || '';
  let generatedToken = false;
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    generatedToken = true;
    log.info('Generated a new access token.');
  }

  const cfg: AppConfig = {
    host: process.env.CLAUDE_REMOTE_HOST || persisted.host || '0.0.0.0',
    port: Number(process.env.CLAUDE_REMOTE_PORT || persisted.port || 8787),
    token,
    claudePath: persisted.claudePath || findClaude(),
    dataDir,
    // Load the user's real Claude Code settings so their skills, plugins and
    // custom slash commands are available. Override via config.json if you want
    // a hermetic server (set to []).
    settingSources: persisted.settingSources ?? ['user', 'project', 'local'],
    defaultModel: persisted.defaultModel ?? null,
    fsRoots: persisted.fsRoots && persisted.fsRoots.length ? persisted.fsRoots : defaultRoots(),
    maxLiveSessions: Number(process.env.CLAUDE_REMOTE_MAX_LIVE || persisted.maxLiveSessions || 12),
    relay: loadRelayConfig(persisted.relay),
  };

  // Persist ONLY a freshly-generated access token, so it stays stable across
  // restarts and is discoverable (install.sh reads it from here). We deliberately
  // do NOT write the resolved config back — env/.env and a hand-edited config.json
  // stay the single source of truth, so removing a var (e.g. relay) actually takes
  // effect next start instead of being silently baked in.
  if (generatedToken) {
    try {
      fs.writeFileSync(configPath, JSON.stringify({ ...persisted, token }, null, 2));
    } catch (e) {
      log.warn('Could not persist config.json:', (e as Error).message);
    }
  }

  return cfg;
}
