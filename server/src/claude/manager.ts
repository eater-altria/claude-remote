import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listSessions, getSessionMessages, deleteSession as sdkDeleteSession } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from '../config.js';
import {
  Capabilities,
  CreateSessionRequest,
  PermissionDecision,
  PermissionMode,
  QuestionAnswer,
  SessionMeta,
  WireEvent,
  EffortLevel,
  ContextUsageDTO,
  UsageDTO,
} from '../protocol.js';
import { ClaudeSession } from './session.js';
import { historyToEvents } from './transform.js';
import { createLogger } from '../logger.js';

const log = createLogger('manager');

interface PersistedSession {
  id: string;
  sdkSessionId: string | null;
  cwd: string;
  title: string;
  model: string | null;
  permissionMode: PermissionMode;
  createdAt: number;
  updatedAt: number;
  totalCostUsd: number;
  lastError?: string;
  /** Last known live state; persisted sessions display as resumable. */
  lastState?: string;
}

export declare interface SessionManager {
  on(e: 'event', l: (sessionId: string, ev: WireEvent) => void): this;
  on(e: 'permission_request', l: (sessionId: string, req: any) => void): this;
  on(e: 'permission_resolved', l: (sessionId: string, r: { requestId: string; decision: PermissionDecision }) => void): this;
  on(e: 'question_request', l: (sessionId: string, req: any) => void): this;
  on(e: 'question_resolved', l: (sessionId: string, r: { requestId: string }) => void): this;
  on(e: 'state', l: (sessionId: string, meta: SessionMeta) => void): this;
  on(e: 'capabilities', l: (sessionId: string, caps: Capabilities) => void): this;
  on(e: 'transcript_reset', l: (sessionId: string, meta: SessionMeta) => void): this;
}

export class SessionManager extends EventEmitter {
  private readonly cfg: AppConfig;
  private readonly storePath: string;
  private readonly capsPath: string;
  private readonly store = new Map<string, PersistedSession>();
  private readonly live = new Map<string, ClaudeSession>();
  private lastCapabilities: Capabilities | null = null;
  /** LRU ordering of live session ids (most-recent at the end). */
  private readonly lru: string[] = [];

  constructor(cfg: AppConfig) {
    super();
    this.cfg = cfg;
    this.storePath = path.join(cfg.dataDir, 'sessions.json');
    this.capsPath = path.join(cfg.dataDir, 'capabilities.json');
    this.loadStore();
    try {
      if (fs.existsSync(this.capsPath)) this.lastCapabilities = JSON.parse(fs.readFileSync(this.capsPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  getCapabilities(): Capabilities | null {
    return this.lastCapabilities;
  }
  private cacheCapabilities(caps: Capabilities): void {
    this.lastCapabilities = caps;
    try {
      fs.writeFileSync(this.capsPath, JSON.stringify(caps, null, 2));
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  // Store persistence
  // -------------------------------------------------------------------------
  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const arr: PersistedSession[] = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
        for (const s of arr) this.store.set(s.id, s);
        log.info(`Loaded ${this.store.size} persisted session(s).`);
      }
    } catch (e) {
      log.warn('Failed to load sessions.json:', (e as Error).message);
    }
  }

  private saveStore(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify([...this.store.values()], null, 2));
    } catch (e) {
      log.warn('Failed to save sessions.json:', (e as Error).message);
    }
  }

  private persistFromSession(s: ClaudeSession): void {
    const existing = this.store.get(s.id);
    const rec: PersistedSession = {
      id: s.id,
      sdkSessionId: s.sdkSessionId,
      cwd: s.cwd,
      title: s.title,
      model: s.model,
      permissionMode: s.mode,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      totalCostUsd: s.totalCostUsd,
      lastError: s.lastError,
      lastState: s.state,
      ...(existing ? {} : {}),
    };
    this.store.set(s.id, rec);
    this.saveStore();
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------
  private wire(s: ClaudeSession): void {
    s.on('event', (ev) => this.emit('event', s.id, ev));
    s.on('permission_request', (req) => this.emit('permission_request', s.id, req));
    s.on('permission_resolved', (r) => this.emit('permission_resolved', s.id, r));
    s.on('question_request', (req) => this.emit('question_request', s.id, req));
    s.on('question_resolved', (r) => this.emit('question_resolved', s.id, r));
    s.on('state', (meta) => {
      this.persistFromSession(s);
      this.emit('state', s.id, meta);
    });
    s.on('capabilities', (caps) => {
      this.cacheCapabilities(caps);
      this.emit('capabilities', s.id, caps);
    });
    s.on('reset', () => this.emit('transcript_reset', s.id, s.getMeta()));
  }

  private touchLru(id: string): void {
    const i = this.lru.indexOf(id);
    if (i >= 0) this.lru.splice(i, 1);
    this.lru.push(id);
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.lru.length > this.cfg.maxLiveSessions) {
      const victimId = this.lru.shift()!;
      const victim = this.live.get(victimId);
      if (victim && victim.state !== 'awaiting_permission' && victim.state !== 'awaiting_question' && victim.state !== 'running') {
        log.info(`Evicting idle live session ${victimId} (LRU).`);
        victim.close();
        this.live.delete(victimId);
      } else if (victim) {
        // Busy — keep it; push back to the end so we don't spin.
        this.lru.push(victimId);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  async create(req: CreateSessionRequest): Promise<SessionMeta> {
    const cwd = path.resolve(req.cwd);
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
    const id = crypto.randomUUID();
    const s = new ClaudeSession({
      id,
      cwd,
      title: req.title?.trim() || path.basename(cwd) || 'New session',
      model: req.model ?? this.cfg.defaultModel,
      permissionMode: req.permissionMode ?? 'default',
      claudePath: this.cfg.claudePath,
      settingSources: this.cfg.settingSources,
    });
    this.wire(s);
    this.live.set(id, s);
    s.start();
    // The SDK only emits `init` (and a session id) once the first user message
    // flows, so don't hard-block here — best-effort wait, then return.
    await s.waitUntilReady(8000).catch(() => {});
    this.touchLru(id);
    this.persistFromSession(s);
    log.info(`Created session ${id} (sdk=${s.sdkSessionId ?? 'pending'}) in ${cwd}`);
    return s.getMeta();
  }

  /** Get a live session, lazily resuming from disk if needed. Returns null if unknown. */
  async ensureLive(id: string): Promise<ClaudeSession | null> {
    const existing = this.live.get(id);
    if (existing) {
      this.touchLru(id);
      return existing;
    }
    const rec = this.store.get(id);
    if (!rec) return null;
    log.info(`Resuming session ${id} from disk (sdk=${rec.sdkSessionId}).`);
    const s = new ClaudeSession({
      id: rec.id,
      cwd: rec.cwd,
      title: rec.title,
      model: rec.model,
      permissionMode: rec.permissionMode,
      claudePath: this.cfg.claudePath,
      settingSources: this.cfg.settingSources,
      resumeSessionId: rec.sdkSessionId ?? undefined,
    });
    this.wire(s);
    this.live.set(id, s);
    // Pre-seed the backlog from the persisted transcript so a re-attaching
    // client sees the full history immediately.
    if (rec.sdkSessionId) {
      try {
        const msgs = await getSessionMessages(rec.sdkSessionId, { dir: rec.cwd });
        s.seedBacklog(historyToEvents(msgs));
        s.seedTasks(msgs);
        s.seedUsageFromHistory(msgs);
      } catch (e) {
        log.warn(`Could not seed history for ${id}:`, (e as Error).message);
      }
    }
    s.start();
    try {
      await s.waitUntilReady(8000);
    } catch (e) {
      log.warn(`Resume of ${id} did not initialize cleanly:`, (e as Error).message);
    }
    this.touchLru(id);
    this.persistFromSession(s);
    return s;
  }

  getLive(id: string): ClaudeSession | undefined {
    return this.live.get(id);
  }

  list(): SessionMeta[] {
    const metas: SessionMeta[] = [];
    const seen = new Set<string>();
    for (const [id, s] of this.live) {
      metas.push(s.getMeta());
      seen.add(id);
    }
    for (const rec of this.store.values()) {
      if (seen.has(rec.id)) continue;
      metas.push({
        id: rec.id,
        cwd: rec.cwd,
        title: rec.title,
        model: rec.model,
        permissionMode: rec.permissionMode,
        state: (rec.lastState as any) === 'closed' || (rec.lastState as any) === 'error' ? 'idle' : 'idle',
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        live: false,
        lastError: rec.lastError,
        totalCostUsd: rec.totalCostUsd,
      });
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas;
  }

  getMeta(id: string): SessionMeta | null {
    const s = this.live.get(id);
    if (s) return s.getMeta();
    const rec = this.store.get(id);
    if (!rec) return null;
    return {
      id: rec.id,
      cwd: rec.cwd,
      title: rec.title,
      model: rec.model,
      permissionMode: rec.permissionMode,
      state: 'idle',
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      live: false,
      lastError: rec.lastError,
      totalCostUsd: rec.totalCostUsd,
    };
  }

  async getHistory(id: string): Promise<WireEvent[]> {
    // Prefer a live session's in-memory backlog (has live streamed detail).
    const live = this.live.get(id);
    if (live && live.getBacklog().length) return live.getBacklog();

    const rec = this.store.get(id);
    if (!rec || !rec.sdkSessionId) return [];
    try {
      const msgs = await getSessionMessages(rec.sdkSessionId, { dir: rec.cwd });
      return historyToEvents(msgs);
    } catch (e) {
      log.warn(`getHistory(${id}) failed:`, (e as Error).message);
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    const live = this.live.get(id);
    const rec = this.store.get(id);
    const sdkId = live?.sdkSessionId ?? rec?.sdkSessionId ?? null;
    const dir = live?.cwd ?? rec?.cwd;

    if (live) {
      live.removeAllListeners();
      live.close();
      this.live.delete(id);
    }
    const i = this.lru.indexOf(id);
    if (i >= 0) this.lru.splice(i, 1);

    if (sdkId && dir) {
      try {
        await sdkDeleteSession(sdkId, { dir });
      } catch (e) {
        log.warn(`SDK deleteSession(${sdkId}) failed:`, (e as Error).message);
      }
    }
    // Remove any files the app uploaded for this session (see rest.ts upload route).
    const uploadsDir = path.join(this.cfg.dataDir, 'uploads', id);
    try {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    } catch (e) {
      log.warn(`Failed to remove uploads dir for ${id}:`, (e as Error).message);
    }

    const had = this.store.delete(id);
    this.saveStore();
    log.info(`Deleted session ${id}.`);
    return had || !!live;
  }

  // -------------------------------------------------------------------------
  // Action helpers used by the gateway
  // -------------------------------------------------------------------------
  async sendUserMessage(id: string, text: string, images?: { mime: string; data: string }[]): Promise<boolean> {
    const s = await this.ensureLive(id);
    if (!s) return false;
    s.sendUserMessage(text, images);
    return true;
  }
  async respondPermission(id: string, requestId: string, decision: PermissionDecision, remember: boolean): Promise<boolean> {
    const s = this.live.get(id);
    return s ? s.respondPermission(requestId, decision, remember) : false;
  }
  async respondQuestion(id: string, requestId: string, answer: QuestionAnswer): Promise<boolean> {
    const s = this.live.get(id);
    return s ? s.respondQuestion(requestId, answer) : false;
  }
  async interrupt(id: string): Promise<boolean> {
    const s = this.live.get(id);
    if (!s) return false;
    await s.interrupt();
    return true;
  }
  async setMode(id: string, mode: PermissionMode): Promise<boolean> {
    const s = await this.ensureLive(id);
    if (!s) return false;
    s.setMode(mode);
    return true;
  }
  async setModel(id: string, model: string | null): Promise<boolean> {
    const s = await this.ensureLive(id);
    if (!s) return false;
    await s.setModelId(model);
    return true;
  }
  async setEffort(id: string, effort: EffortLevel | null): Promise<boolean> {
    const s = await this.ensureLive(id);
    if (!s) return false;
    await s.setEffort(effort);
    return true;
  }
  async getContextUsage(id: string): Promise<ContextUsageDTO | null> {
    const s = await this.ensureLive(id);
    return s ? s.getContextUsage() : null;
  }
  async getUsage(id: string): Promise<UsageDTO | null> {
    const s = await this.ensureLive(id);
    return s ? s.getUsage() : null;
  }

  shutdown(): void {
    for (const s of this.live.values()) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    this.live.clear();
  }
}
