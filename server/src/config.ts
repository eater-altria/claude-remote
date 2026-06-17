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

export function loadConfig(): AppConfig {
  const dataDir = process.env.CLAUDE_REMOTE_DATA_DIR || path.join(os.homedir(), '.claude-remote');
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
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
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
  };

  // Persist the resolved config (so the token is stable across restarts).
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  } catch (e) {
    log.warn('Could not persist config.json:', (e as Error).message);
  }

  return cfg;
}
