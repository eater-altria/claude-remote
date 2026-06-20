import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import type { SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from './logger.js';

const log = createLogger('config');

export interface AppConfig {
  host: string;
  port: number;
  /** Bearer token required on every HTTP request and the WS handshake. */
  token: string;
  /** Absolute path to the `claude` executable, or null to let the SDK resolve
   *  its own version-matched bundled native binary. */
  claudePath: string | null;
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

/** Locate a *directly launchable* `claude` executable, or return null to let the
 *  SDK resolve its own version-matched bundled native binary. The SDK spawns
 *  `pathToClaudeCodeExecutable` directly as a native binary (unless it ends in
 *  .js/.mjs), so we must never hand it a wrapper script. In particular the npm
 *  global shim on Windows (`…\npm\claude`, no extension, plus `.cmd`/`.ps1`) is
 *  NOT a native binary — pointing the SDK at it fails with "native binary …
 *  exists but failed to launch". When we find nothing launchable we return null;
 *  the SDK then loads its bundled binary from the `@anthropic-ai/claude-agent-sdk-
 *  <platform>` optional dependency, which a normal `npm install` already pulls in. */
function findClaude(): string | null {
  // 1. Explicit override always wins (assumed launchable by the operator).
  if (process.env.CLAUDE_REMOTE_CLAUDE_PATH) return process.env.CLAUDE_REMOTE_CLAUDE_PATH;
  // 2. Native-installer locations — real launchable binaries.
  const candidates =
    process.platform === 'win32'
      ? [path.join(os.homedir(), '.local', 'bin', 'claude.exe')]
      : [
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
  // 3. PATH lookup — but only accept a directly launchable result. On Windows
  //    that means a real `.exe`; the extensionless / `.cmd` / `.ps1` npm shims
  //    are wrapper scripts the SDK can't spawn, so we skip them and fall through
  //    to the bundled binary instead.
  try {
    const which = process.platform === 'win32' ? 'where claude' : 'command -v claude';
    const lines = execSync(which, { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const pick = process.platform === 'win32' ? lines.find((l) => /\.exe$/i.test(l)) : lines[0];
    if (pick) return pick;
  } catch {
    /* ignore */
  }
  // 4. Nothing launchable found → let the SDK resolve its own bundled native
  //    binary (version-matched to the SDK). Requires a normal `npm install`
  //    (without --omit=optional) so the platform optional dependency is present.
  log.info('No external `claude` install detected; using the SDK-bundled native binary.');
  return null;
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
  if (process.platform === 'win32') roots.push(...windowsDrives());
  else roots.push({ name: 'Filesystem root', path: '/' });
  return roots;
}

/** The picker's roots: a hand-written `fsRoots` (config.json) wins, else the
 *  auto-detected defaults. On Windows we always append any mounted drive that's
 *  missing, so a stale persisted list (e.g. one baked by an older build that only
 *  knew C:\) can't hide other disks from the picker. */
function resolveFsRoots(persisted: { name: string; path: string }[] | undefined): { name: string; path: string }[] {
  const roots = persisted && persisted.length ? [...persisted] : defaultRoots();
  if (process.platform === 'win32') {
    const have = new Set(roots.map((r) => r.path.toUpperCase()));
    for (const d of windowsDrives()) if (!have.has(d.path.toUpperCase())) roots.push(d);
  }
  return roots;
}

/** Mounted Windows drive roots (C:–Z:). Each drive root has no parent
 *  (path.dirname('E:\\') === 'E:\\'), so the picker can't navigate off C: to
 *  another disk unless every drive is offered as a top-level root. A:/B: are
 *  skipped to avoid legacy floppy probe delays. */
function windowsDrives(): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = [];
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(drive)) out.push({ name: drive, path: drive });
    } catch {
      /* drive not ready (e.g. empty removable) — skip */
    }
  }
  return out;
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
    claudePath: persisted.claudePath ?? findClaude(),
    dataDir,
    // Load the user's real Claude Code settings so their skills, plugins and
    // custom slash commands are available. Override via config.json if you want
    // a hermetic server (set to []).
    settingSources: persisted.settingSources ?? ['user', 'project', 'local'],
    defaultModel: persisted.defaultModel ?? null,
    fsRoots: resolveFsRoots(persisted.fsRoots),
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
