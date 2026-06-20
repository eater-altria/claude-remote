# Claude Remote — Cloud Relay

Lets the mobile app reach a local server that isn't on the same LAN. The local
server **dials out** to this relay over a single persistent WebSocket; the relay
reverse-proxies the app's HTTP + WebSocket traffic down that tunnel. One relay
serves **many** servers, keyed by `serverId`.

```
App  ──HTTPS/WSS──▶  relay  ◀──WSS (dial-out)──  local server (behind NAT)
     /s/<serverId>/...                            127.0.0.1:<port> (loopback)
```

The relay never sees the server's access token in the clear — the agent registers
only a SHA-256 hash of it, and the relay verifies each app request's token against
that hash before forwarding. The relay payloads stay opaque to the relay: it only
multiplexes streams, so 100% of the existing server logic (auth, WS, REST, file
downloads) is reused verbatim on the loopback side.

## Run

```bash
npm install
cp .env.example .env              # then edit RELAY_TOKEN
npm run build && npm start        # or: npm run dev
```

Config is read from `relay/.env` (auto-loaded on start) or real env vars — real env
wins. Environment:

| Var          | Default     | Meaning                                                    |
|--------------|-------------|------------------------------------------------------------|
| `RELAY_PORT` | `8080`      | Listen port.                                               |
| `RELAY_HOST` | `0.0.0.0`   | Bind address.                                              |
| `RELAY_TOKEN`| auto-gen    | Shared secret every agent must present to register. **Set this in production.** |

Put it behind a TLS-terminating reverse proxy (Caddy/nginx/Cloudflare) so apps and
agents connect over `https`/`wss`. The relay speaks plain HTTP/WS itself; both the
`/agent` control socket and `/s/:serverId/*` proxy routes ride the same port.

### Routes

- `GET /healthz` — liveness + connected-server count.
- `wss://…/agent?token=<RELAY_TOKEN>` — local-server control channel.
- `https://…/s/<serverId>/…` and `wss://…/s/<serverId>/ws` — the app-facing address.

## Point a local server at it

Set these on the **server** (env or `~/.claude-remote/config.json` `relay` block):

```bash
CLAUDE_REMOTE_RELAY_ENABLED=1
CLAUDE_REMOTE_RELAY_URL=https://relay.example.com   # ws/wss derived automatically
CLAUDE_REMOTE_RELAY_TOKEN=<RELAY_TOKEN>             # must match the relay
CLAUDE_REMOTE_RELAY_SERVER_ID=home-mac             # optional; auto-generated + persisted if unset
CLAUDE_REMOTE_RELAY_NAME="Home Mac"                # optional label
```

On startup the server logs its relay address. In the app, add a server whose URL is
that `https://relay.example.com/s/<serverId>` address and whose token is the
server's **own access token** (not `RELAY_TOKEN`). LAN access keeps working in
parallel and is unaffected.
