# Claude Remote — server

Node + TypeScript server that drives Claude Code via `@anthropic-ai/claude-agent-sdk`
and exposes it to the app over HTTP + WebSocket.

```bash
npm install
npm run dev      # tsx watch
npm run build    # -> dist/
npm start        # node dist/index.js
npm run typecheck
```

### Layout

| Path | Responsibility |
|---|---|
| `src/protocol.ts` | Wire types shared with the app (source of truth) |
| `src/config.ts` | Config + token + claude binary discovery |
| `src/claude/session.ts` | One live `query()` per session; PreToolUse permission gate; ask_user round-trip; state + backlog |
| `src/claude/manager.ts` | Session CRUD, persistence, lazy resume, LRU eviction |
| `src/claude/transform.ts` | SDK messages/stream events → normalized `WireEvent`s |
| `src/claude/permissions.ts` | Tool classification + per-mode policy |
| `src/claude/askTool.ts` | In-process MCP `ask_user` tool (clarification cards) |
| `src/http/rest.ts` · `fsbrowse.ts` | REST API + filesystem picker |
| `src/ws/gateway.ts` | WebSocket gateway (auth, routing, prompt replay) |

### REST API (Bearer token on all routes except `/api/health`)

```
GET    /api/health
GET    /api/sessions
POST   /api/sessions              { cwd, title?, model?, permissionMode? }
GET    /api/sessions/:id
GET    /api/sessions/:id/messages
DELETE /api/sessions/:id
GET    /api/fs/roots
GET    /api/fs/list?path=…&hidden=1
POST   /api/fs/mkdir              { parent, name }
WS     /ws?token=…
```

### Smoke test

With the server running on port 8799 (token `testtoken`):

```bash
node scripts/smoke.mjs
```

Exercises create → attach → Bash permission approval → clarification question → delete.
