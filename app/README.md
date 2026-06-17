# Claude Remote — app

Expo / React Native (expo-router, TypeScript) client for the Claude Remote server.

```bash
npm install
npx expo start          # open in Expo Go (all native deps are bundled there)
npx expo run:android    # native build (needs Android SDK + device/emulator)
npx tsc --noEmit         # typecheck
```

Configure the server URL + token under the gear icon. On an Android emulator use
`http://10.0.2.2:8787`; on a real device use the computer's LAN IP.

### Layout

| Path | Responsibility |
|---|---|
| `src/app/_layout.tsx` | Root stack + providers, loads saved config |
| `src/app/index.tsx` | Sessions list (create / open / delete) |
| `src/app/settings.tsx` | Server URL + token, connection test |
| `src/app/new-session.tsx` | Server-backed directory picker + options |
| `src/app/session/[id].tsx` | Chat: transcript, streaming, approvals, questions, slash-command palette, model picker |
| `src/api/` | protocol (mirror), REST client, reconnecting WebSocket |
| `src/state/` | zustand store + `WireEvent` → render-item reducer |
| `src/components/` | Markdown, Diff, ToolCard, ThinkingBlock, PermissionSheet, QuestionCards, CommandPalette, ModelPicker |

### Slash commands

Type `/` in the chat box to open a command palette (live-filtered as you type,
e.g. `/c` → clear, compact, context, code-review…). It lists every slash
command the server reports — built-ins, skills, and plugin commands.

- Selecting a no-arg command runs it immediately; a command with args inserts it
  so you can fill them in.
- `/model` opens an in-app model picker (also reachable from the model pill in
  the header) and switches the live model.
- `/clear` resets the conversation context and wipes the transcript.
- All other commands/skills are sent to Claude Code, which expands/runs them.
| `src/theme/theme.ts` | Colors / spacing / typography |

> `src/api/protocol.ts` is a copy of `server/src/protocol.ts` — keep them in sync.
