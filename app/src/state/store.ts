import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient, type ServerConfig, type ServerProfile } from '../api/client';
import { WsConnection, type WsStatus } from '../api/ws';
import type {
  Capabilities,
  ContextUsageDTO,
  EffortLevel,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  QuestionAnswer,
  QuestionRequest,
  ServerMessage,
  SessionMeta,
  UsageDTO,
} from '../api/protocol';
import { applyEvent, reduceEvents, type TranscriptItem } from './transcript';

const LEGACY_CONFIG_KEY = 'claude-remote.config.v1';
const SERVERS_KEY = 'claude-remote.servers.v1';

interface PersistedServers {
  servers: ServerProfile[];
  activeId: string | null;
}

function makeId(): string {
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SessionView {
  items: TranscriptItem[];
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  meta?: SessionMeta;
  capabilities?: Capabilities;
}

interface StoreState {
  /** Active server connection (derived from the active profile), or null when none. */
  config: ServerConfig | null;
  /** All saved servers the user can switch between. */
  servers: ServerProfile[];
  /** Id of the currently active server, or null. */
  activeId: string | null;
  configLoaded: boolean;
  wsStatus: WsStatus;
  sessions: SessionMeta[];
  views: Record<string, SessionView>;
  /** Latest capabilities seen from any session (fallback for the palette). */
  capabilities: Capabilities | null;

  // lifecycle
  loadConfig: () => Promise<void>;
  /** Add a new server (does not switch to it) and return the created profile. */
  addServer: (p: { name: string; baseUrl: string; token: string }) => Promise<ServerProfile>;
  /** Edit an existing server. If it is the active one, the live connection is refreshed. */
  updateServer: (id: string, patch: { name?: string; baseUrl?: string; token?: string }) => Promise<void>;
  /** Delete a server. If it was active, falls back to another (or disconnects). */
  removeServer: (id: string) => Promise<void>;
  /** Make `id` the active server and (re)connect to it. */
  switchServer: (id: string) => Promise<void>;

  // data
  refreshSessions: () => Promise<void>;
  createSession: (cwd: string, opts: { title?: string; model?: string | null; permissionMode?: PermissionMode }) => Promise<SessionMeta>;
  deleteSession: (id: string) => Promise<void>;

  // per-session live
  openSession: (id: string) => void;
  closeSession: (id: string) => void;
  sendMessage: (id: string, text: string, images?: { mime: string; data: string }[]) => void;
  respondPermission: (id: string, requestId: string, decision: PermissionDecision, remember: boolean) => void;
  respondQuestion: (id: string, requestId: string, answer: QuestionAnswer) => void;
  interrupt: (id: string) => void;
  setMode: (id: string, mode: PermissionMode) => void;
  setModel: (id: string, model: string | null) => void;
  setEffort: (id: string, effort: EffortLevel | null) => void;
  requestContext: (id: string) => Promise<ContextUsageDTO>;
  requestUsage: (id: string) => Promise<UsageDTO>;

  // internal
  _onMessage: (msg: ServerMessage) => void;
}

// Module-level singletons (not part of reactive state).
let client: ApiClient | null = null;
let ws: WsConnection | null = null;

// Pending get_context / get_usage requests, correlated by requestId.
let infoReqCounter = 0;
const pendingInfo = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>();

function requestInfo(sessionId: string, kind: 'context' | 'usage'): Promise<any> {
  if (!ws) return Promise.reject(new Error('Not connected'));
  const requestId = `info-${++infoReqCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingInfo.delete(requestId);
      reject(new Error('Request timed out'));
    }, 20000);
    pendingInfo.set(requestId, { resolve, reject, timer });
    const sent = ws!.send(kind === 'context' ? { t: 'get_context', sessionId, requestId } : { t: 'get_usage', sessionId, requestId });
    if (!sent) {
      clearTimeout(timer);
      pendingInfo.delete(requestId);
      reject(new Error('Not connected'));
    }
  });
}

export function getClient(): ApiClient | null {
  return client;
}

export const useStore = create<StoreState>((set, get) => {
  const ensureView = (id: string): Record<string, SessionView> => {
    const views = get().views;
    if (views[id]) return views;
    return { ...views, [id]: { items: [], permissions: [], questions: [], meta: undefined } };
  };

  const patchView = (id: string, fn: (v: SessionView) => SessionView) => {
    set((state) => {
      const cur = state.views[id] ?? { items: [], permissions: [], questions: [] };
      return { views: { ...state.views, [id]: fn(cur) } };
    });
  };

  /** Persist the current server list + active id to storage. */
  const persistServers = async () => {
    const { servers, activeId } = get();
    const payload: PersistedServers = { servers, activeId };
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(payload));
  };

  /** Tear down any live connection and open a fresh one to `cfg` (or none). */
  const connect = (cfg: ServerConfig | null) => {
    if (ws) ws.stop();
    ws = null;
    client = null;
    if (cfg) {
      client = new ApiClient(cfg);
      ws = new WsConnection(client.wsUrl());
      ws.onStatus = (s) => set({ wsStatus: s });
      ws.onMessage = (m) => get()._onMessage(m);
      ws.start();
      set({ config: cfg, wsStatus: 'idle' });
    } else {
      set({ config: null, wsStatus: 'idle' });
    }
  };

  return {
    config: null,
    servers: [],
    activeId: null,
    configLoaded: false,
    wsStatus: 'idle',
    sessions: [],
    views: {},
    capabilities: null,

    async loadConfig() {
      try {
        const raw = await AsyncStorage.getItem(SERVERS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedServers;
          const servers = parsed.servers ?? [];
          const activeId = parsed.activeId && servers.some((s) => s.id === parsed.activeId) ? parsed.activeId : servers[0]?.id ?? null;
          set({ servers, activeId });
          const active = servers.find((s) => s.id === activeId) ?? null;
          connect(active);
          return;
        }

        // Migrate the legacy single-server config into the new list.
        const legacy = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
        if (legacy) {
          const cfg = JSON.parse(legacy) as ServerConfig;
          const profile: ServerProfile = { id: makeId(), name: 'My server', baseUrl: cfg.baseUrl, token: cfg.token };
          set({ servers: [profile], activeId: profile.id });
          await persistServers();
          await AsyncStorage.removeItem(LEGACY_CONFIG_KEY);
          connect(profile);
        }
      } catch {
        /* ignore */
      } finally {
        set({ configLoaded: true });
      }
    },

    async addServer({ name, baseUrl, token }) {
      const profile: ServerProfile = { id: makeId(), name: name.trim() || baseUrl.trim(), baseUrl: baseUrl.trim(), token: token.trim() };
      const first = get().servers.length === 0;
      set((s) => ({ servers: [...s.servers, profile] }));
      await persistServers();
      // Auto-activate the very first server added.
      if (first) await get().switchServer(profile.id);
      return profile;
    },

    async updateServer(id, patch) {
      set((s) => ({
        servers: s.servers.map((srv) =>
          srv.id === id
            ? {
                ...srv,
                ...(patch.name !== undefined ? { name: patch.name.trim() || srv.name } : {}),
                ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl.trim() } : {}),
                ...(patch.token !== undefined ? { token: patch.token.trim() } : {}),
              }
            : srv,
        ),
      }));
      await persistServers();
      if (get().activeId === id) {
        const active = get().servers.find((s) => s.id === id);
        if (active) connect({ baseUrl: active.baseUrl, token: active.token });
      }
    },

    async removeServer(id) {
      const wasActive = get().activeId === id;
      const remaining = get().servers.filter((s) => s.id !== id);
      const nextActive = wasActive ? remaining[0]?.id ?? null : get().activeId;
      set({ servers: remaining, activeId: nextActive });
      await persistServers();
      if (wasActive) {
        const active = remaining.find((s) => s.id === nextActive) ?? null;
        set({ sessions: [], views: {} });
        connect(active ? { baseUrl: active.baseUrl, token: active.token } : null);
      }
    },

    async switchServer(id) {
      const target = get().servers.find((s) => s.id === id);
      if (!target || get().activeId === id) return;
      set({ activeId: id, sessions: [], views: {} });
      await persistServers();
      connect({ baseUrl: target.baseUrl, token: target.token });
    },

    async refreshSessions() {
      if (!client) return;
      const { sessions } = await client.listSessions();
      set({ sessions });
    },

    async createSession(cwd, opts) {
      if (!client) throw new Error('Not connected');
      const { session } = await client.createSession({ cwd, title: opts.title, model: opts.model, permissionMode: opts.permissionMode });
      set((s) => ({ sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)] }));
      return session;
    },

    async deleteSession(id) {
      if (!client) return;
      await client.deleteSession(id);
      ws?.detach(id);
      set((s) => {
        const views = { ...s.views };
        delete views[id];
        return { sessions: s.sessions.filter((x) => x.id !== id), views };
      });
    },

    openSession(id) {
      set({ views: ensureView(id) });
      ws?.attach(id);
    },

    closeSession(id) {
      ws?.detach(id);
    },

    sendMessage(id, text, images) {
      ws?.send({ t: 'user_message', sessionId: id, text, images });
    },
    respondPermission(id, requestId, decision, remember) {
      ws?.send({ t: 'permission_response', sessionId: id, requestId, decision, remember });
      // optimistic removal
      patchView(id, (v) => ({ ...v, permissions: v.permissions.filter((p) => p.requestId !== requestId) }));
    },
    respondQuestion(id, requestId, answer) {
      ws?.send({ t: 'question_response', sessionId: id, requestId, answer });
      patchView(id, (v) => ({ ...v, questions: v.questions.filter((q) => q.requestId !== requestId) }));
    },
    interrupt(id) {
      ws?.send({ t: 'interrupt', sessionId: id });
    },
    setMode(id, mode) {
      ws?.send({ t: 'set_permission_mode', sessionId: id, mode });
      patchView(id, (v) => ({ ...v, meta: v.meta ? { ...v.meta, permissionMode: mode } : v.meta }));
    },
    setModel(id, model) {
      ws?.send({ t: 'set_model', sessionId: id, model });
      patchView(id, (v) => ({ ...v, meta: v.meta ? { ...v.meta, model } : v.meta }));
    },
    setEffort(id, effort) {
      ws?.send({ t: 'set_effort', sessionId: id, effort });
      patchView(id, (v) => ({ ...v, meta: v.meta ? { ...v.meta, effort } : v.meta }));
    },
    requestContext(id) {
      return requestInfo(id, 'context') as Promise<ContextUsageDTO>;
    },
    requestUsage(id) {
      return requestInfo(id, 'usage') as Promise<UsageDTO>;
    },

    _onMessage(msg: ServerMessage) {
      switch (msg.t) {
        case 'backlog':
          patchView(msg.sessionId, (v) => ({ ...v, items: reduceEvents(msg.events), meta: msg.meta }));
          break;
        case 'event':
          patchView(msg.sessionId, (v) => ({ ...v, items: applyEvent(v.items, msg.event) }));
          break;
        case 'attached':
        case 'session_state': {
          const meta = msg.meta;
          patchView(msg.sessionId, (v) => ({ ...v, meta }));
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === meta.id ? meta : x)) }));
          break;
        }
        case 'capabilities':
          patchView(msg.sessionId, (v) => ({ ...v, capabilities: msg.capabilities }));
          set({ capabilities: msg.capabilities });
          break;
        case 'transcript_reset':
          patchView(msg.sessionId, (v) => ({ ...v, items: [], permissions: [], questions: [], meta: msg.meta }));
          break;
        case 'permission_request':
          patchView(msg.sessionId, (v) => ({
            ...v,
            permissions: v.permissions.some((p) => p.requestId === msg.request.requestId)
              ? v.permissions
              : [...v.permissions, msg.request],
          }));
          break;
        case 'permission_resolved':
          patchView(msg.sessionId, (v) => ({ ...v, permissions: v.permissions.filter((p) => p.requestId !== msg.requestId) }));
          break;
        case 'question_request':
          patchView(msg.sessionId, (v) => ({
            ...v,
            questions: v.questions.some((q) => q.requestId === msg.request.requestId)
              ? v.questions
              : [...v.questions, msg.request],
          }));
          break;
        case 'question_resolved':
          patchView(msg.sessionId, (v) => ({ ...v, questions: v.questions.filter((q) => q.requestId !== msg.requestId) }));
          break;
        case 'info_result': {
          const p = pendingInfo.get(msg.requestId);
          if (p) {
            pendingInfo.delete(msg.requestId);
            clearTimeout(p.timer);
            if (msg.ok) p.resolve(msg.kind === 'context' ? msg.context : msg.usage);
            else p.reject(new Error(msg.error || 'Request failed'));
          }
          break;
        }
        case 'error':
          // surfaced via notice item if a session is known
          if (msg.sessionId) {
            patchView(msg.sessionId, (v) => ({
              ...v,
              items: [...v.items, { type: 'notice', id: `err-${Date.now()}`, level: 'error', text: msg.message, ts: Date.now() }],
            }));
          }
          break;
        default:
          break;
      }
    },
  };
});
