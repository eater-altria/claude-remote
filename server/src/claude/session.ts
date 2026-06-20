import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKMessage,
  SDKUserMessage,
  Options,
  SettingSource,
  PreToolUseHookInput,
  SlashCommand,
  ModelInfo,
  AgentInfo,
} from '@anthropic-ai/claude-agent-sdk';
import {
  PermissionMode,
  SessionMeta,
  SessionState,
  WireEvent,
  PermissionRequest,
  PermissionDecision,
  QuestionRequest,
  Question,
  QuestionAnswer,
  Capabilities,
  SlashCommandDTO,
  EffortLevel,
  ContextUsageDTO,
  UsageDTO,
  UsageRateLimitDTO,
} from '../protocol.js';
import { buildAskServer } from './askTool.js';
import { buildFilesServer } from './filesTool.js';
import {
  decidePolicy,
  categorize,
  describeTool,
  deriveFileChange,
  titleForTool,
  planDenyReason,
} from './permissions.js';
import { LiveTransformer } from './transform.js';
import { createLogger } from '../logger.js';

const log = createLogger('session');

const PENDING_TIMEOUT_MS = 30 * 60 * 1000; // auto-deny if unanswered for 30 min

/** Runtime effort is applied via the thinking-token budget — the only knob this
 * SDK version exposes at runtime (there is no setEffort). null = engine default. */
const EFFORT_THINKING_TOKENS: Record<EffortLevel, number> = {
  low: 4000,
  medium: 10000,
  high: 24000,
  xhigh: 32000,
  max: 60000,
};
const ASK_TOOL_NAME = 'mcp__ask__ask_user';
const SEND_FILE_TOOL_NAME = 'mcp__files__send_file';
const SEND_IMAGE_TOOL_NAME = 'mcp__files__send_image';
const MAX_BACKLOG = 4000;

/** A file staged for download by `send_file`, keyed by an opaque fileId. */
interface StagedFile {
  path: string;
  name: string;
  size: number;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', log: 'text/plain',
  json: 'application/json', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
  csv: 'text/csv', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', ts: 'text/plain', tsx: 'text/plain', jsx: 'text/plain',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic', bmp: 'image/bmp',
  zip: 'application/zip', gz: 'application/gzip', tgz: 'application/gzip', tar: 'application/x-tar',
  apk: 'application/vnd.android.package-archive', ipa: 'application/octet-stream',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
};

function guessMime(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export interface SessionOptions {
  id: string; // our internal id; becomes the SDK session id once init arrives
  cwd: string;
  title: string;
  model: string | null;
  permissionMode: PermissionMode;
  claudePath: string;
  settingSources: SettingSource[];
  /** When resuming a persisted session, the SDK session id to resume. */
  resumeSessionId?: string;
}

interface Pending<T> {
  resolve: (v: T) => void;
  timer: NodeJS.Timeout;
}

export declare interface ClaudeSession {
  on(e: 'event', l: (ev: WireEvent) => void): this;
  on(e: 'permission_request', l: (r: PermissionRequest) => void): this;
  on(e: 'permission_resolved', l: (r: { requestId: string; decision: PermissionDecision }) => void): this;
  on(e: 'question_request', l: (r: QuestionRequest) => void): this;
  on(e: 'question_resolved', l: (r: { requestId: string }) => void): this;
  on(e: 'state', l: (m: SessionMeta) => void): this;
  on(e: 'capabilities', l: (c: Capabilities) => void): this;
  on(e: 'reset', l: () => void): this;
}

const BUILTIN_COMMANDS = new Set([
  'clear', 'compact', 'context', 'usage', 'usage-credits', 'extra-usage', 'init', 'review',
  'security-review', 'reload-skills', 'heapdump', 'insights', 'help', 'agents', 'model', 'cost', 'status',
]);

function classifyCommand(name: string): SlashCommandDTO['source'] {
  if (name.includes(':')) return 'plugin';
  if (BUILTIN_COMMANDS.has(name)) return 'builtin';
  return 'skill';
}

export class ClaudeSession extends EventEmitter {
  readonly id: string;
  readonly cwd: string;
  title: string;
  model: string | null;
  mode: PermissionMode;
  effort: EffortLevel | null = null;

  state: SessionState = 'starting';
  sdkSessionId: string | null = null;
  totalCostUsd = 0;
  /** Usage snapshot from the most recent `result`, used to estimate context
   * occupancy when the live get_context_usage control request is unavailable. */
  private lastUsage: any = null;
  private lastModelUsage: Record<string, any> | null = null;
  /** Once a live get_context_usage / get_usage control request times out, this
   * CLI build doesn't implement it — skip the (doomed) live probe on every
   * later call and answer instantly from the estimate. */
  private liveContextUnavailable = false;
  private liveUsageUnavailable = false;
  lastError?: string;
  readonly createdAt = Date.now();
  updatedAt = Date.now();

  private q: Query | null = null;
  private readonly abort = new AbortController();
  private transformer = new LiveTransformer();
  private readonly backlog: WireEvent[] = [];
  private initialized = false;
  capabilities: Capabilities | null = null;

  private readonly inputQueue: SDKUserMessage[] = [];
  private inputResolver: (() => void) | null = null;
  private ended = false;

  private readyResolve: (() => void) | null = null;
  private readonly ready: Promise<void>;

  private readonly pendingPermissions = new Map<string, Pending<{ decision: PermissionDecision; remember: boolean }>>();
  private readonly pendingQuestions = new Map<string, Pending<QuestionAnswer>>();
  /** Snapshots so a reconnecting client can re-render outstanding prompts. */
  private readonly openPermissionRequests = new Map<string, PermissionRequest>();
  private readonly openQuestionRequests = new Map<string, QuestionRequest>();
  private readonly remembered = new Set<string>();

  private readonly opts: SessionOptions;
  private reqCounter = 0;
  /** Files staged by `send_file`, downloadable via the REST file endpoint. */
  private readonly stagedFiles = new Map<string, StagedFile>();

  constructor(opts: SessionOptions) {
    super();
    this.opts = opts;
    this.id = opts.id;
    this.cwd = opts.cwd;
    this.title = opts.title;
    this.model = opts.model;
    this.mode = opts.permissionMode;
    // Seed from the resume id so persistence never clobbers it with null before
    // the first init lands, and so the reset heuristic has a baseline to compare.
    this.sdkSessionId = opts.resumeSessionId ?? null;
    this.ready = new Promise((r) => (this.readyResolve = r));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  start(): void {
    const askServer = buildAskServer((questions) => this.askUser(questions));
    const filesServer = buildFilesServer(
      (p, description) => this.sendFile(p, description),
      (p, caption) => this.sendImage(p, caption),
    );

    const planPrompt =
      this.mode === 'plan'
        ? '\n\nYou are currently in PLAN mode: do not modify files or run commands. Investigate read-only and present a clear plan for approval.'
        : '';

    const options: Options = {
      cwd: this.cwd,
      pathToClaudeCodeExecutable: this.opts.claudePath,
      settingSources: this.opts.settingSources,
      // We always keep the SDK in 'default' and enforce our own policy in the
      // PreToolUse hook (the canUseTool path is broken in this SDK version).
      permissionMode: 'default',
      includePartialMessages: true,
      model: this.model ?? undefined,
      title: this.title,
      mcpServers: { ask: askServer, files: filesServer },
      allowedTools: [ASK_TOOL_NAME, SEND_FILE_TOOL_NAME, SEND_IMAGE_TOOL_NAME],
      disallowedTools: ['AskUserQuestion'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append:
          'When you need the user to make a choice or clarify something, call the mcp__ask__ask_user tool ' +
          '(never the AskUserQuestion tool) to present interactive option cards. ' +
          "When the user asks you to send, share, or give them a file, call the mcp__files__send_file tool " +
          "with the file's path so they get a download card on their phone. " +
          'To show the user an image inline in the chat (a screenshot, chart, diagram, or generated image), ' +
          'call the mcp__files__send_image tool with the image path instead of send_file.' +
          planPrompt,
      },
      abortController: this.abort,
      resume: this.opts.resumeSessionId,
      hooks: {
        PreToolUse: [{ hooks: [(input) => this.onPreToolUse(input as PreToolUseHookInput)], timeout: 3600 }],
      },
      stderr: (d: string) => {
        if (/error|denied|fatal|ENOENT/i.test(d)) log.warn(`[${this.id}] stderr:`, d.trim().slice(0, 300));
      },
    };

    this.q = query({ prompt: this.inputGenerator(), options });
    this.consume().catch((e) => this.fail(e));
    // The SDK doesn't emit `init` until the first user message is processed.
    // The session can already accept (and queue) input now, so mark it
    // idle-and-ready immediately instead of leaving it stuck in 'starting' —
    // which the app renders as "busy" and hides the send button, deadlocking
    // the very first message until the user taps the stop button.
    if (this.state === 'starting') this.setState('idle');
    this.readyResolve?.();
    this.readyResolve = null;
    // Control requests work before the first turn, so we can populate the
    // command palette immediately.
    this.fetchCapabilities().catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Capabilities (slash commands / models / agents) for the command palette
  // -------------------------------------------------------------------------
  private async fetchCapabilities(): Promise<void> {
    if (!this.q) return;
    const withTimeout = <T>(p: Promise<T>, ms = 15000): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    const [cmdsR, modelsR, agentsR] = await Promise.allSettled([
      withTimeout(this.q.supportedCommands()),
      withTimeout(this.q.supportedModels()),
      withTimeout(this.q.supportedAgents()),
    ]);

    const commands: SlashCommandDTO[] = [];
    if (cmdsR.status === 'fulfilled') {
      for (const c of cmdsR.value as SlashCommand[]) {
        commands.push({
          name: c.name,
          description: c.description ?? '',
          argumentHint: c.argumentHint ?? '',
          aliases: c.aliases,
          source: classifyCommand(c.name),
        });
      }
    }
    // Synthesize client-only commands the engine doesn't list but we drive via UI.
    if (!commands.some((c) => c.name === 'model')) {
      commands.push({ name: 'model', description: 'Switch the model for this session', argumentHint: '', source: 'client', client: true });
    }

    const models =
      modelsR.status === 'fulfilled'
        ? (modelsR.value as ModelInfo[]).map((m) => ({
            value: m.value,
            displayName: m.displayName,
            description: m.description,
            supportsEffort: m.supportsEffort,
          }))
        : [];
    const agents =
      agentsR.status === 'fulfilled'
        ? (agentsR.value as AgentInfo[]).map((a) => ({ name: a.name, description: a.description }))
        : [];

    this.capabilities = { commands, models, agents, currentModel: this.model };
    this.emit('capabilities', this.capabilities);
    if (commands.length) log.info(`[${this.id}] capabilities: ${commands.length} commands, ${models.length} models`);
  }

  getCapabilities(): Capabilities | null {
    return this.capabilities;
  }

  /** Resolves once the SDK has initialized (session id captured) or rejects on timeout. */
  async waitUntilReady(timeoutMs = 60000): Promise<void> {
    let t: NodeJS.Timeout;
    await Promise.race([
      this.ready,
      new Promise<void>((_, rej) => {
        t = setTimeout(() => rej(new Error('Timed out starting Claude session')), timeoutMs);
      }),
    ]).finally(() => clearTimeout(t!));
  }

  private async *inputGenerator(): AsyncGenerator<SDKUserMessage> {
    while (!this.ended) {
      if (this.inputQueue.length) {
        yield this.inputQueue.shift()!;
      } else {
        await new Promise<void>((r) => (this.inputResolver = r));
      }
    }
  }

  private async consume(): Promise<void> {
    if (!this.q) return;
    for await (const msg of this.q) {
      try {
        this.handle(msg);
      } catch (e) {
        log.error(`[${this.id}] handler error:`, (e as Error).message);
      }
    }
  }

  private handle(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system': {
        const m = msg as any;
        if (m.subtype === 'init') {
          const wasInitialized = this.initialized;
          const prevSid = this.sdkSessionId;
          const newSid: string | null = m.session_id ?? null;
          this.initialized = true;
          if (newSid) this.sdkSessionId = newSid;
          if (m.model) this.model = m.model;
          if (wasInitialized && newSid && prevSid && newSid !== prevSid) {
            // The SDK re-emits `init` at the start of every turn with the SAME
            // session id; only a genuine context reset (e.g. /clear starts a
            // fresh conversation) changes the id. So wipe the transcript only
            // when the id actually changes — never on an ordinary turn boundary.
            this.resetTranscript();
          } else if (this.state === 'starting') {
            this.setState('idle');
          } else {
            this.touch();
          }
          this.readyResolve?.();
          this.readyResolve = null;
        } else if (m.subtype === 'status') {
          if (m.status === 'requesting') this.setState('running');
        } else if (m.subtype === 'session_state_changed') {
          if (m.state === 'idle' && this.state === 'running') this.setState('idle');
          else if (m.state === 'running') this.setState('running');
        } else if (m.subtype === 'commands_changed') {
          if (this.capabilities) {
            this.capabilities = {
              ...this.capabilities,
              commands: this.mergeCommands((m as any).commands ?? []),
            };
            this.emit('capabilities', this.capabilities);
          }
        } else {
          this.emitEvents(this.transformer.onSystem(msg as any));
        }
        break;
      }
      case 'assistant':
        this.setState('running');
        this.emitEvents(this.transformer.onAssistant(msg as any));
        break;
      case 'user':
        this.emitEvents(this.transformer.onUser(msg as any));
        break;
      case 'stream_event':
        this.emitEvents(this.transformer.onStreamEvent(msg as any));
        break;
      case 'result': {
        const m = msg as any;
        if (typeof m.total_cost_usd === 'number') this.totalCostUsd = m.total_cost_usd;
        if (m.usage) this.lastUsage = m.usage;
        if (m.modelUsage) this.lastModelUsage = m.modelUsage;
        this.emitEvents(this.transformer.onResult(msg as any));
        if (this.pendingPermissions.size === 0 && this.pendingQuestions.size === 0) this.setState('idle');
        break;
      }
      default:
        break;
    }
  }

  private fail(e: unknown): void {
    this.lastError = (e as Error)?.message || String(e);
    log.error(`[${this.id}] query failed:`, this.lastError);
    this.setState('error');
    this.readyResolve?.();
    this.readyResolve = null;
  }

  // -------------------------------------------------------------------------
  // User input
  // -------------------------------------------------------------------------
  sendUserMessage(text: string, images?: { mime: string; data: string }[]): void {
    if (this.ended) return;
    this.pushEvent({ kind: 'user', id: this.nid('u'), text, imageCount: images?.length || undefined, ts: Date.now() });
    const content =
      images && images.length
        ? [
            ...images.map((im) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: im.mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: im.data },
            })),
            ...(text ? [{ type: 'text' as const, text }] : []),
          ]
        : text;
    this.inputQueue.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null });
    this.inputResolver?.();
    this.inputResolver = null;
    this.setState('running');
  }

  async interrupt(): Promise<void> {
    // Unblock any pending prompts as a denial / no-answer so the turn can stop.
    for (const [id, p] of this.pendingPermissions) {
      clearTimeout(p.timer);
      p.resolve({ decision: 'deny', remember: false });
      this.openPermissionRequests.delete(id);
    }
    this.pendingPermissions.clear();
    for (const [id, p] of this.pendingQuestions) {
      clearTimeout(p.timer);
      p.resolve({ selections: [] });
      this.openQuestionRequests.delete(id);
    }
    this.pendingQuestions.clear();
    try {
      await this.q?.interrupt();
    } catch (e) {
      log.warn(`[${this.id}] interrupt error:`, (e as Error).message);
    }
    this.setState('idle');
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.touch();
  }

  async setModelId(model: string | null): Promise<void> {
    this.model = model;
    try {
      await this.q?.setModel(model ?? undefined);
    } catch (e) {
      log.warn(`[${this.id}] setModel error:`, (e as Error).message);
    }
    this.touch();
  }

  async setEffort(effort: EffortLevel | null): Promise<void> {
    this.effort = effort;
    try {
      // No runtime setEffort in this SDK; approximate via the thinking budget.
      await this.q?.setMaxThinkingTokens(effort ? EFFORT_THINKING_TOKENS[effort] : null);
    } catch (e) {
      log.warn(`[${this.id}] setEffort error:`, (e as Error).message);
    }
    this.touch();
  }

  /** Race an SDK control request against a deadline. These requests hang
   * indefinitely if the installed `claude` CLI doesn't answer the subtype, so
   * every live control request below is capped. */
  private withControlTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('control request timed out')), ms)),
    ]);
  }

  async getContextUsage(): Promise<ContextUsageDTO | null> {
    if (!this.q) return null;
    // Skip the doomed live probe once we know this CLI doesn't answer it.
    if (this.liveContextUnavailable) return this.estimateContextUsage();
    try {
      // The CLI tallies the full breakdown lazily — the first call after a turn
      // can take ~7-8s (subsequent calls are cached and fast). A tight timeout
      // here is why this used to fall back to the single-bucket estimate. Allow
      // ample headroom, staying safely under the app's 20s request timeout.
      const r = await this.withControlTimeout(this.q.getContextUsage(), 15000);
      return {
        model: r.model,
        totalTokens: r.totalTokens,
        maxTokens: r.maxTokens,
        percentage: r.percentage,
        categories: (r.categories ?? []).map((c) => ({ name: c.name, tokens: c.tokens, color: c.color })),
      };
    } catch (e) {
      const msg = (e as Error).message;
      // A transient timeout (e.g. the CLI was mid-turn, or the context is large
      // and slow to tally) must NOT permanently disable the live breakdown —
      // otherwise one slow probe latches the whole session onto the single-bucket
      // estimate and even Refresh can't recover. Only latch off when the request
      // is genuinely unsupported by this CLI build; timeouts just fall back once.
      if (!/timed out/i.test(msg)) this.liveContextUnavailable = true;
      log.warn(`[${this.id}] getContextUsage fell back to estimate:`, msg);
      return this.estimateContextUsage();
    }
  }

  /** Seed usage from the persisted transcript on resume, so /context works
   * immediately — before any new turn produces a live `result`. Scans backward
   * for the last assistant message and lifts its Anthropic usage block. */
  seedUsageFromHistory(messages: { type: string; message: unknown }[]): void {
    if (this.lastUsage) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type !== 'assistant') continue;
      const msg = messages[i].message as any;
      const u = msg?.usage;
      if (u && (u.input_tokens != null || u.cache_read_input_tokens != null)) {
        this.lastUsage = u;
        if (msg.model && !this.model) this.model = msg.model;
        return;
      }
    }
  }

  /** Approximate context occupancy from the most recent `result` usage. The
   * input side of the last turn (fresh + cached) is the size of the prompt that
   * was sent, i.e. the current conversation context. */
  private estimateContextUsage(): ContextUsageDTO | null {
    const u = this.lastUsage;
    if (!u) return null;
    const used =
      (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (!used) return null;
    const mu =
      (this.model && this.lastModelUsage?.[this.model]) ||
      (this.lastModelUsage ? Object.values(this.lastModelUsage)[0] : null);
    const maxTokens: number =
      mu?.contextWindow || (this.model?.includes('[1m]') ? 1_000_000 : 200_000);
    return {
      model: this.model ?? 'unknown',
      totalTokens: used,
      maxTokens,
      percentage: maxTokens ? (used / maxTokens) * 100 : 0,
      categories: [{ name: 'Conversation (estimated)', tokens: used, color: '#C96442' }],
    };
  }

  async getUsage(): Promise<UsageDTO | null> {
    if (!this.q) return null;
    if (this.liveUsageUnavailable) return this.estimateUsage();
    let r: any;
    try {
      r = await this.withControlTimeout(this.q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET());
    } catch (e) {
      this.liveUsageUnavailable = true;
      log.warn(`[${this.id}] getUsage fell back to estimate:`, (e as Error).message);
      return this.estimateUsage();
    }
    const models = Object.entries(r.session?.model_usage ?? {}).map(([model, u]: [string, any]) => ({
      model,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      costUsd: u.costUSD ?? 0,
    }));
    const rl: any = r.rate_limits ?? {};
    const rateLimits: UsageRateLimitDTO[] = [];
    const pushRl = (label: string, w: any) => {
      if (w) rateLimits.push({ label, utilization: w.utilization ?? null, resetsAt: w.resets_at ?? null });
    };
    pushRl('5-hour', rl.five_hour);
    pushRl('7-day', rl.seven_day);
    pushRl('7-day (Opus)', rl.seven_day_opus);
    pushRl('7-day (Sonnet)', rl.seven_day_sonnet);
    return {
      sessionCostUsd: r.session?.total_cost_usd ?? 0,
      linesAdded: r.session?.total_lines_added ?? 0,
      linesRemoved: r.session?.total_lines_removed ?? 0,
      models,
      subscriptionType: r.subscription_type ?? null,
      rateLimits,
    };
  }

  /** Minimal usage view from the last turn's per-model totals when the live
   * usage control request is unavailable. No rate-limit windows are known. */
  private estimateUsage(): UsageDTO | null {
    if (!this.lastModelUsage) return this.totalCostUsd ? { sessionCostUsd: this.totalCostUsd, linesAdded: 0, linesRemoved: 0, models: [], subscriptionType: null, rateLimits: [] } : null;
    const models = Object.entries(this.lastModelUsage).map(([model, u]: [string, any]) => ({
      model,
      inputTokens: (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0),
      outputTokens: u.outputTokens ?? 0,
      costUsd: u.costUSD ?? 0,
    }));
    return {
      sessionCostUsd: this.totalCostUsd,
      linesAdded: 0,
      linesRemoved: 0,
      models,
      subscriptionType: null,
      rateLimits: [],
    };
  }

  close(): void {
    this.ended = true;
    this.inputResolver?.();
    this.inputResolver = null;
    for (const [, p] of this.pendingPermissions) {
      clearTimeout(p.timer);
      p.resolve({ decision: 'deny', remember: false });
    }
    this.pendingPermissions.clear();
    this.openPermissionRequests.clear();
    for (const [, p] of this.pendingQuestions) {
      clearTimeout(p.timer);
      p.resolve({ selections: [] });
    }
    this.pendingQuestions.clear();
    this.openQuestionRequests.clear();
    try {
      this.q?.close();
    } catch {
      /* ignore */
    }
    try {
      this.abort.abort();
    } catch {
      /* ignore */
    }
    this.setState('closed');
  }

  // -------------------------------------------------------------------------
  // Permission gate (PreToolUse hook)
  // -------------------------------------------------------------------------
  private async onPreToolUse(input: PreToolUseHookInput) {
    const toolName = input.tool_name;
    const toolInput = input.tool_input as any;
    const policy = decidePolicy(toolName, this.mode, this.remembered);

    if (policy === 'allow') {
      return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
    }
    if (policy === 'deny') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny' as const,
          permissionDecisionReason: planDenyReason(toolName),
        },
      };
    }

    // policy === 'ask' → round-trip to the app.
    const requestId = this.nid('perm');
    const category = categorize(toolName);
    const request: PermissionRequest = {
      requestId,
      toolName,
      category,
      title: titleForTool(toolName, category),
      detail: describeTool(toolName, toolInput),
      input: toolInput,
      fileChange: deriveFileChange(toolName, toolInput),
      ts: Date.now(),
    };

    const decision = await new Promise<{ decision: PermissionDecision; remember: boolean }>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        this.openPermissionRequests.delete(requestId);
        resolve({ decision: 'deny', remember: false });
      }, PENDING_TIMEOUT_MS);
      this.pendingPermissions.set(requestId, { resolve, timer });
      this.openPermissionRequests.set(requestId, request);
      this.setState('awaiting_permission');
      this.emit('permission_request', request);
    });

    if (decision.remember && decision.decision === 'allow') this.remembered.add(toolName);
    this.emit('permission_resolved', { requestId, decision: decision.decision });
    // Return to running if nothing else is pending.
    if (this.pendingPermissions.size === 0 && this.pendingQuestions.size === 0) this.setState('running');

    if (decision.decision === 'allow') {
      return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: 'The user declined this action.',
      },
    };
  }

  respondPermission(requestId: string, decision: PermissionDecision, remember: boolean): boolean {
    const p = this.pendingPermissions.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pendingPermissions.delete(requestId);
    this.openPermissionRequests.delete(requestId);
    p.resolve({ decision, remember });
    return true;
  }

  // -------------------------------------------------------------------------
  // Clarification questions (ask_user MCP tool)
  // -------------------------------------------------------------------------
  private async askUser(questions: Question[]): Promise<QuestionAnswer> {
    const requestId = this.nid('q');
    const request: QuestionRequest = { requestId, questions, ts: Date.now() };
    const answer = await new Promise<QuestionAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingQuestions.delete(requestId);
        this.openQuestionRequests.delete(requestId);
        resolve({ selections: questions.map(() => []) });
      }, PENDING_TIMEOUT_MS);
      this.pendingQuestions.set(requestId, { resolve, timer });
      this.openQuestionRequests.set(requestId, request);
      this.setState('awaiting_question');
      this.emit('question_request', request);
    });
    this.emit('question_resolved', { requestId });
    if (this.pendingPermissions.size === 0 && this.pendingQuestions.size === 0) this.setState('running');
    return answer;
  }

  respondQuestion(requestId: string, answer: QuestionAnswer): boolean {
    const p = this.pendingQuestions.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pendingQuestions.delete(requestId);
    this.openQuestionRequests.delete(requestId);
    p.resolve(answer);
    return true;
  }

  // -------------------------------------------------------------------------
  // File delivery (send_file MCP tool)
  // -------------------------------------------------------------------------
  /** Validate a path and return its metadata — no side effects (no staging). */
  private resolveFile(filePath: string): StagedFile {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      throw new Error(`No such file: ${abs}`);
    }
    if (!stat.isFile()) throw new Error(`Not a regular file: ${abs}`);
    fs.accessSync(abs, fs.constants.R_OK); // throws if unreadable
    return { path: abs, name: path.basename(abs), size: stat.size, mime: guessMime(path.basename(abs)) };
  }

  /** Register a resolved file so the REST endpoint can serve it; returns its fileId. */
  private registerFile(entry: StagedFile): string {
    const fileId = this.nid('file');
    this.stagedFiles.set(fileId, entry);
    return fileId;
  }

  /** Stage a file for download and push a file card to the app. */
  sendFile(filePath: string, description?: string): { name: string; size: number } {
    const e = this.resolveFile(filePath);
    const fileId = this.registerFile(e);
    this.pushEvent({ kind: 'file', id: this.nid('ev'), fileId, name: e.name, size: e.size, mime: e.mime, description, ts: Date.now() });
    return { name: e.name, size: e.size };
  }

  /** Stage an image and push it for inline display in the chat. */
  sendImage(filePath: string, caption?: string): { name: string; size: number } {
    const e = this.resolveFile(filePath);
    if (!e.mime.startsWith('image/')) throw new Error(`Not an image file (detected ${e.mime}): ${e.name}`);
    const fileId = this.registerFile(e);
    this.pushEvent({ kind: 'image', id: this.nid('ev'), fileId, name: e.name, size: e.size, mime: e.mime, caption, ts: Date.now() });
    return { name: e.name, size: e.size };
  }

  /** Look up a staged file for the REST download endpoint. */
  getStagedFile(fileId: string): StagedFile | undefined {
    return this.stagedFiles.get(fileId);
  }

  // -------------------------------------------------------------------------
  // Subscriptions / snapshots
  // -------------------------------------------------------------------------
  getBacklog(): WireEvent[] {
    return this.backlog.slice();
  }
  /** Preload historical events (used when resuming a session from disk). */
  seedBacklog(events: WireEvent[]): void {
    if (this.backlog.length) return; // only seed once, before any live events
    this.backlog.push(...events);
    if (this.backlog.length > MAX_BACKLOG) this.backlog.splice(0, this.backlog.length - MAX_BACKLOG);
  }
  getOpenPermissionRequests(): PermissionRequest[] {
    return [...this.openPermissionRequests.values()];
  }
  getOpenQuestionRequests(): QuestionRequest[] {
    return [...this.openQuestionRequests.values()];
  }

  getMeta(): SessionMeta {
    return {
      id: this.id,
      cwd: this.cwd,
      title: this.title,
      model: this.model,
      permissionMode: this.mode,
      effort: this.effort,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      live: !this.ended,
      lastError: this.lastError,
      totalCostUsd: this.totalCostUsd,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  private resetTranscript(): void {
    this.backlog.length = 0;
    this.transformer = new LiveTransformer();
    this.emit('reset');
    this.setState('idle');
    this.pushEvent({ kind: 'notice', id: this.nid('nt'), level: 'info', text: 'Context cleared — fresh conversation.', ts: Date.now() });
  }

  private mergeCommands(commands: SlashCommand[]): SlashCommandDTO[] {
    const out: SlashCommandDTO[] = commands.map((c) => ({
      name: c.name,
      description: c.description ?? '',
      argumentHint: c.argumentHint ?? '',
      aliases: c.aliases,
      source: classifyCommand(c.name),
    }));
    if (!out.some((c) => c.name === 'model')) {
      out.push({ name: 'model', description: 'Switch the model for this session', argumentHint: '', source: 'client', client: true });
    }
    return out;
  }

  private emitEvents(events: WireEvent[]): void {
    for (const ev of events) this.pushEvent(ev);
  }

  private pushEvent(ev: WireEvent): void {
    this.backlog.push(ev);
    if (this.backlog.length > MAX_BACKLOG) this.backlog.splice(0, this.backlog.length - MAX_BACKLOG);
    this.emit('event', ev);
  }

  private setState(s: SessionState): void {
    if (this.state === s) return;
    // Never leave a terminal state.
    if (this.state === 'closed' || this.state === 'error') return;
    this.state = s;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
    this.emit('state', this.getMeta());
  }

  private nid(prefix: string): string {
    this.reqCounter += 1;
    return `${prefix}_${this.id.slice(0, 6)}_${this.reqCounter}`;
  }
}
