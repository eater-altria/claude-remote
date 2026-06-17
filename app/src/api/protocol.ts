/**
 * Wire protocol shared between the Claude Remote server and the Expo app.
 *
 * This file is the single source of truth. The app keeps a mirrored copy at
 * `app/src/api/protocol.ts` — keep them in sync when you change anything here.
 */

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Permission modes (subset of the SDK's, exposed to the app)
// ---------------------------------------------------------------------------
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/** Reasoning effort level, mirrors the SDK's EffortLevel. `null` = engine default. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: 'Ask before acting',
  acceptEdits: 'Auto-accept edits',
  bypassPermissions: 'Bypass (YOLO)',
  plan: 'Plan only',
};

// ---------------------------------------------------------------------------
// Session lifecycle state
// ---------------------------------------------------------------------------
export type SessionState =
  | 'starting'
  | 'idle'
  | 'running'
  | 'awaiting_permission'
  | 'awaiting_question'
  | 'error'
  | 'closed';

export interface SessionMeta {
  id: string;
  /** Working directory Claude Code runs in. */
  cwd: string;
  title: string;
  model: string | null;
  permissionMode: PermissionMode;
  /** Current reasoning effort, or null/absent for the engine default. */
  effort?: EffortLevel | null;
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  /** Whether the underlying SDK query is live in memory (vs. only persisted on disk). */
  live: boolean;
  lastError?: string;
  totalCostUsd?: number;
}

// ---------------------------------------------------------------------------
// Transcript wire events — the normalized stream the app renders.
// ---------------------------------------------------------------------------
export type ToolCategory = 'read' | 'edit' | 'execute' | 'search' | 'web' | 'task' | 'ask' | 'other';

export interface FileChange {
  path: string;
  /** 'create' = new file (Write to non-existent), 'write' = full overwrite, 'edit' = partial. */
  changeType: 'create' | 'write' | 'edit';
  /** For edits: the unified-ish before/after pairs we can diff in the app. */
  edits?: Array<{ oldText: string; newText: string }>;
  /** For full writes/creates: the new content. */
  content?: string;
}

export type WireEvent =
  // A user turn (your message).
  | { kind: 'user'; id: string; text: string; imageCount?: number; ts: number }
  // Streaming block lifecycle (live token rendering for text & thinking).
  | { kind: 'block_start'; id: string; blockId: string; blockType: 'text' | 'thinking'; initialText?: string; ts: number }
  | { kind: 'block_delta'; id: string; blockId: string; text: string; ts: number }
  | { kind: 'block_end'; id: string; blockId: string; ts: number }
  // Assistant tool invocation (consolidated, input fully formed).
  | {
      kind: 'tool_use';
      id: string;
      blockId: string;
      toolUseId: string;
      name: string;
      category: ToolCategory;
      title: string;
      input: unknown;
      /** Present for Write/Edit/MultiEdit/NotebookEdit so the app can render a diff card. */
      fileChange?: FileChange;
      ts: number;
    }
  // Result of a tool invocation.
  | {
      kind: 'tool_result';
      id: string;
      toolUseId: string;
      isError: boolean;
      /** Plain-text rendering of the result content. */
      text: string;
      ts: number;
    }
  // A subagent (Task) lifecycle notice.
  | { kind: 'task'; id: string; status: 'started' | 'progress' | 'completed' | 'failed'; description: string; ts: number }
  // End of an assistant turn.
  | {
      kind: 'result';
      id: string;
      subtype: string;
      isError: boolean;
      costUsd?: number;
      numTurns?: number;
      ts: number;
    }
  // System / informational notice.
  | { kind: 'notice'; id: string; level: 'info' | 'warn' | 'error'; text: string; ts: number }
  // A file Claude is delivering to the user's device. The bytes are fetched
  // on demand via GET /api/sessions/:id/files/:fileId (the server path is never
  // sent to the client — only this opaque fileId + display metadata).
  | { kind: 'file'; id: string; fileId: string; name: string; size: number; mime: string; description?: string; ts: number }
  // An image Claude wants shown inline in the chat (rendered, not downloaded).
  // Bytes come from the same GET /api/sessions/:id/files/:fileId endpoint.
  | { kind: 'image'; id: string; fileId: string; name: string; size: number; mime: string; caption?: string; ts: number };

// ---------------------------------------------------------------------------
// Permission requests (PreToolUse gate)
// ---------------------------------------------------------------------------
export interface PermissionRequest {
  requestId: string;
  toolName: string;
  category: ToolCategory;
  title: string;
  /** Human-readable one-liner, e.g. the command or the file path. */
  detail: string;
  input: unknown;
  fileChange?: FileChange;
  ts: number;
}

export type PermissionDecision = 'allow' | 'deny';

// ---------------------------------------------------------------------------
// Clarification questions (custom ask_user MCP tool)
// ---------------------------------------------------------------------------
export interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}
export interface Question {
  header: string;
  question: string;
  multiSelect: boolean;
  options: QuestionOption[];
}
export interface QuestionRequest {
  requestId: string;
  questions: Question[];
  ts: number;
}
export interface QuestionAnswer {
  /** One answer per question, in order. Each is the list of chosen labels (or custom text). */
  selections: string[][];
}

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------
export interface HealthResponse {
  ok: true;
  name: 'claude-remote-server';
  version: string;
  protocol: number;
  claudeCodeVersion: string;
  platform: string;
}

export interface CreateSessionRequest {
  cwd: string;
  title?: string;
  model?: string | null;
  permissionMode?: PermissionMode;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
}
export interface FsListResponse {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}
export interface FsRoot {
  name: string;
  path: string;
}

export interface ModelInfoDTO {
  id: string;
  displayName: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Slash-command capabilities (for the in-app command palette)
// ---------------------------------------------------------------------------
export interface SlashCommandDTO {
  /** Command name without the leading slash, e.g. "clear", "code-review", "telegram:access". */
  name: string;
  description: string;
  /** e.g. "<file>" or "[low|medium|high]". Empty when the command takes no args. */
  argumentHint: string;
  aliases?: string[];
  /** Where it came from, for grouping/labels in the UI. */
  source: 'builtin' | 'skill' | 'plugin' | 'client';
  /** A client command (e.g. model) is handled by the app UI, not sent to the engine. */
  client?: boolean;
}

export interface ModelOptionDTO {
  /** Identifier passed to set_model, e.g. "sonnet", "opus[1m]", "default". */
  value: string;
  displayName: string;
  description?: string;
  supportsEffort?: boolean;
}

export interface AgentOptionDTO {
  name: string;
  description: string;
}

export interface Capabilities {
  commands: SlashCommandDTO[];
  models: ModelOptionDTO[];
  agents: AgentOptionDTO[];
  /** Currently active model id (best-effort, from session init). */
  currentModel?: string | null;
}

// ---------------------------------------------------------------------------
// WebSocket envelopes
// ---------------------------------------------------------------------------
export type ClientMessage =
  | { t: 'attach'; sessionId: string }
  | { t: 'detach'; sessionId: string }
  | { t: 'user_message'; sessionId: string; text: string; images?: { mime: string; data: string }[] }
  | { t: 'permission_response'; sessionId: string; requestId: string; decision: PermissionDecision; remember?: boolean }
  | { t: 'question_response'; sessionId: string; requestId: string; answer: QuestionAnswer }
  | { t: 'interrupt'; sessionId: string }
  | { t: 'set_permission_mode'; sessionId: string; mode: PermissionMode }
  | { t: 'set_model'; sessionId: string; model: string | null }
  | { t: 'set_effort'; sessionId: string; effort: EffortLevel | null }
  | { t: 'get_context'; sessionId: string; requestId: string }
  | { t: 'get_usage'; sessionId: string; requestId: string }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'hello'; protocol: number; version: string }
  | { t: 'attached'; sessionId: string; meta: SessionMeta }
  | { t: 'event'; sessionId: string; event: WireEvent }
  /** Sent on attach to replay the full transcript backlog, then live events follow. */
  | { t: 'backlog'; sessionId: string; events: WireEvent[]; meta: SessionMeta }
  | { t: 'permission_request'; sessionId: string; request: PermissionRequest }
  | { t: 'permission_resolved'; sessionId: string; requestId: string; decision: PermissionDecision }
  | { t: 'question_request'; sessionId: string; request: QuestionRequest }
  | { t: 'question_resolved'; sessionId: string; requestId: string }
  | { t: 'session_state'; sessionId: string; meta: SessionMeta }
  | { t: 'capabilities'; sessionId: string; capabilities: Capabilities }
  /** The conversation context was cleared (e.g. via /clear) — wipe the transcript. */
  | { t: 'transcript_reset'; sessionId: string; meta: SessionMeta }
  | { t: 'error'; sessionId?: string; message: string }
  /** Response to a get_context / get_usage request, correlated by requestId. */
  | { t: 'info_result'; sessionId: string; requestId: string; kind: 'context' | 'usage'; ok: boolean; context?: ContextUsageDTO; usage?: UsageDTO; error?: string }
  | { t: 'pong' };

// ---------------------------------------------------------------------------
// Context & usage (rendered as native cards in the app — /context and /usage)
// ---------------------------------------------------------------------------
export interface ContextUsageDTO {
  model: string;
  totalTokens: number;
  maxTokens: number;
  /** 0–100, share of the context window in use. */
  percentage: number;
  categories: { name: string; tokens: number; color: string }[];
}

export interface UsageModelDTO {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageRateLimitDTO {
  label: string;
  /** 0–100, or null when unavailable. */
  utilization: number | null;
  /** ISO 8601 reset timestamp, or null. */
  resetsAt: string | null;
}

export interface UsageDTO {
  sessionCostUsd: number;
  linesAdded: number;
  linesRemoved: number;
  models: UsageModelDTO[];
  subscriptionType: string | null;
  rateLimits: UsageRateLimitDTO[];
}
