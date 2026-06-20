import type {
  CreateSessionRequest,
  FsListResponse,
  FsRoot,
  GitStatusDTO,
  HealthResponse,
  PermissionDecision,
  QuestionAnswer,
  SessionMeta,
  WireEvent,
} from './protocol';

export interface ServerConfig {
  /** e.g. http://192.168.1.20:8787 */
  baseUrl: string;
  token: string;
}

/** A saved server the user can quick-switch between. */
export interface ServerProfile extends ServerConfig {
  id: string;
  /** User-facing label, e.g. "Home Mac" or "Work laptop". */
  name: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeBase(url: string): string {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

export class ApiClient {
  constructor(private cfg: ServerConfig) {}

  get baseUrl() {
    return normalizeBase(this.cfg.baseUrl);
  }

  private async req<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.token}`,
          ...(init?.headers || {}),
        },
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok) throw new ApiError(res.status, body?.error || `HTTP ${res.status}`);
      return body as T;
    } catch (e: any) {
      if (e instanceof ApiError) throw e;
      if (e?.name === 'AbortError') throw new ApiError(0, 'Request timed out');
      throw new ApiError(0, e?.message || 'Network error');
    } finally {
      clearTimeout(timeout);
    }
  }

  health() {
    return this.req<HealthResponse>('/api/health', { timeoutMs: 8000 });
  }
  listSessions() {
    return this.req<{ sessions: SessionMeta[] }>('/api/sessions');
  }
  createSession(body: CreateSessionRequest) {
    return this.req<{ session: SessionMeta }>('/api/sessions', { method: 'POST', body: JSON.stringify(body), timeoutMs: 30000 });
  }
  getSession(id: string) {
    return this.req<{ session: SessionMeta }>(`/api/sessions/${id}`);
  }
  getMessages(id: string) {
    return this.req<{ events: WireEvent[]; session: SessionMeta }>(`/api/sessions/${id}/messages`);
  }
  deleteSession(id: string) {
    return this.req<{ deleted: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' });
  }
  gitStatus(id: string) {
    return this.req<{ git: GitStatusDTO }>(`/api/sessions/${id}/git`, { timeoutMs: 12000 });
  }
  gitDiff(id: string, filePath: string) {
    return this.req<{ diff: string }>(`/api/sessions/${id}/git/diff?path=${encodeURIComponent(filePath)}`, { timeoutMs: 12000 });
  }
  respondPermissionRest(id: string, requestId: string, decision: PermissionDecision, remember = false) {
    return this.req<{ ok: boolean }>(`/api/sessions/${id}/permission`, { method: 'POST', body: JSON.stringify({ requestId, decision, remember }) });
  }
  respondQuestionRest(id: string, requestId: string, answer: QuestionAnswer) {
    return this.req<{ ok: boolean }>(`/api/sessions/${id}/question`, { method: 'POST', body: JSON.stringify({ requestId, answer }) });
  }
  fsRoots() {
    return this.req<{ roots: FsRoot[] }>('/api/fs/roots');
  }
  fsList(path: string, hidden = false) {
    return this.req<FsListResponse>(`/api/fs/list?path=${encodeURIComponent(path)}${hidden ? '&hidden=1' : ''}`);
  }
  fsMkdir(parent: string, name: string) {
    return this.req<{ path: string }>('/api/fs/mkdir', { method: 'POST', body: JSON.stringify({ parent, name }) });
  }

  wsUrl(): string {
    const base = this.baseUrl.replace(/^http/i, 'ws');
    return `${base}/ws?token=${encodeURIComponent(this.cfg.token)}`;
  }
}
