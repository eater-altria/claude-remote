# Claude Remote

Talk to **Claude Code** running on your computer from a modern native Android app.
A small Node server drives the [Claude Agent SDK] (the same engine as the
`claude` CLI) and exposes it over HTTP + WebSocket; the Expo app connects over
your LAN.

```
┌──────────────┐        HTTP + WebSocket        ┌────────────────────────────┐
│  Expo app    │ ─────────────────────────────▶ │  Server (Node + TS)        │
│  (Android)   │ ◀───────────────────────────── │   Claude Agent SDK ↔ claude │
└──────────────┘   sessions · stream · approve   └────────────────────────────┘
```

## What it does

- 💬 Chat with Claude Code over your network — multi-turn, streaming.
- 🧠 Renders the **thinking process**, replies (markdown), tool calls, command
  output, and **code modifications as diffs**.
- ✅ **Approve or deny** each command / file edit from your phone, with an
  "always allow this tool" toggle and per-session permission modes
  (Ask · Auto-accept edits · Bypass · Plan).
- ❓ Renders Claude's **clarification questions as option cards** (single or
  multi-select, with an "Other" free-text answer).
- 🗂 **New sessions pick a working directory by browsing the server's
  filesystem** — no typing paths, and create folders inline.
- 🖼 **Send images** along with a message, and **`@file` mention autocomplete**
  that browses the project tree as you type.
- 📎 **Claude can deliver files to your phone** (`send_file`) — they show up as
  download cards, fetched over an authenticated endpoint (the server path is
  never exposed).
- ⚙️ **Switch model, reasoning effort, and permission mode mid-session.**
- 🎛 **Command palette** of the engine's slash commands, models, and sub-agents.
- 📊 **`/context` and `/usage`** rendered as native cards (token budget, cost,
  rate-limit windows).
- ➕ Create, ⏸ resume, and 🗑 delete sessions.
- 🌐 Save **multiple server profiles** (home Mac, work laptop) and switch fast.
- 🔌 Server **auto-starts on boot/login** (launchd on macOS, systemd on Linux).

## Repository layout

```
claude-remote/
├── server/      Node + TypeScript server (Claude Agent SDK wrapper)
├── app/         Expo / React Native app (expo-router, TypeScript)
├── install/     Auto-start installers (launchd / systemd)
├── PROJECT_OVERVIEW.md   Full architecture & design notes
└── README.md
```

---

## 1. Server

Requires Node 18+ and a logged-in `claude` CLI (`claude` → `/login`). No API key
needed — it reuses your Claude Code subscription auth.

```bash
cd server
npm install
npm run dev        # development (tsx, hot reload)
#   or
npm run build && npm start   # production
```

On startup it prints the **URL** and **access token** you'll enter in the app,
e.g.:

```
  Listening on 0.0.0.0:8787
  Connect the app to one of:
    http://192.168.1.20:8787
  Access token:  Xy3...   (also saved to ~/.claude-remote/config.json)
```

### Auto-start on boot/login

```bash
bash install/install.sh      # builds + installs the service, prints URL & token
bash install/uninstall.sh    # remove it later
```

- **macOS** → `~/Library/LaunchAgents/com.claude-remote.server.plist`
- **Linux** → `~/.config/systemd/user/claude-remote.service`
  (for true boot start when logged out: `sudo loginctl enable-linger $USER`)

### Configuration (`~/.claude-remote/config.json`, or env vars)

| Env var | Default | Meaning |
|---|---|---|
| `CLAUDE_REMOTE_PORT` | `8787` | Listen port |
| `CLAUDE_REMOTE_HOST` | `0.0.0.0` | Bind address |
| `CLAUDE_REMOTE_TOKEN` | *(generated)* | Bearer token required by the app |
| `CLAUDE_REMOTE_CLAUDE_PATH` | *(auto-detected)* | Path to the `claude` binary |
| `CLAUDE_REMOTE_DATA_DIR` | `~/.claude-remote` | Config + session metadata |
| `CLAUDE_REMOTE_MAX_LIVE` | `12` | Max concurrent live sessions (idle ones are LRU-evicted) |

> By default the server loads your real Claude Code settings
> (`settingSources: ['user', 'project', 'local']`), so your skills, plugins, and
> custom slash commands are available. Set it to `[]` for isolated runs.

---

## 2. App

Requires the [Expo](https://expo.dev) toolchain. Easiest is **Expo Go**
(all native modules used are bundled in it):

```bash
cd app
npm install
npx expo start              # scan the QR code with Expo Go on your phone
# or build a native dev/release app:
npx expo run:android        # needs Android SDK + a device/emulator
```

In the app:

1. Open **Server** (gear icon) → enter the URL + token from the server logs →
   *Test & Connect*.
   - Real device: use your computer's LAN IP, e.g. `http://192.168.1.20:8787`.
   - Android emulator: use `http://10.0.2.2:8787`.
2. Tap **＋**, browse to a folder, pick a permission mode, **Start**.
3. Chat. Approve commands and answer questions as they pop up.

> Both the phone and the computer must be on the same network, and the server
> port (8787) must be reachable (allow it through the firewall).

---

## How it works (notes for hackers)

- The server keeps one live `query()` (streaming-input mode) per session. The
  SDK session id, working dir, and metadata are persisted to
  `~/.claude-remote/sessions.json`; transcripts live in the standard Claude
  Code session store and are replayed on resume. Up to `maxLiveSessions` stay
  warm in memory; idle ones are closed LRU and lazily resumed on next attach.
- **Permissions** are enforced with a `PreToolUse` hook that round-trips an
  allow/deny decision to the app. (The SDK's `canUseTool` callback path is
  avoided — it crashes in the current SDK build.)
- **Clarification cards** use a custom in-process MCP tool `ask_user`
  (pre-approved), so the question/answer round-trip is fully controlled; the
  built-in `AskUserQuestion` tool is disabled.
- **File delivery** uses a second in-process MCP tool `send_file`: bytes are
  staged by an opaque `fileId` and fetched via
  `GET /api/sessions/:id/files/:fileId` — the real server path never leaves the
  process.
- The wire protocol is defined once in `server/src/protocol.ts` and mirrored to
  `app/src/api/protocol.ts`.

For the full architecture deep-dive, see [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md).

[Claude Agent SDK]: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
