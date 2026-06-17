#!/usr/bin/env bash
#
# Claude Remote — server installer + auto-start setup.
#
# Builds the server and installs a boot/login service so it starts
# automatically:
#   - macOS:  a launchd LaunchAgent (~/Library/LaunchAgents)
#   - Linux:  a systemd --user service (~/.config/systemd/user)
#
# Usage:  bash install/install.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
LABEL="com.claude-remote.server"
DATA_DIR="${CLAUDE_REMOTE_DATA_DIR:-$HOME/.claude-remote}"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH. Install Node.js 18+ first." >&2
  exit 1
fi
CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$CLAUDE_BIN" ]; then
  for c in "$HOME/.local/bin/claude" /usr/local/bin/claude /opt/homebrew/bin/claude; do
    [ -x "$c" ] && CLAUDE_BIN="$c" && break
  done
fi

bold "Claude Remote installer"
info "repo:     $REPO_ROOT"
info "node:     $NODE_BIN"
info "claude:   ${CLAUDE_BIN:-(not found — set CLAUDE_REMOTE_CLAUDE_PATH later)}"
info "data dir: $DATA_DIR"

bold "1/3  Building the server"
cd "$SERVER_DIR"
npm install --no-audit --no-fund
npm run build

mkdir -p "$DATA_DIR"

# Build a PATH the service can use to find `claude` and `node`.
SERVICE_PATH="$(dirname "$NODE_BIN"):$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
if [ -n "${CLAUDE_BIN:-}" ]; then SERVICE_PATH="$(dirname "$CLAUDE_BIN"):$SERVICE_PATH"; fi

OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  bold "2/3  Installing launchd LaunchAgent"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SERVER_DIR/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$SERVER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$SERVICE_PATH</string>
    <key>CLAUDE_REMOTE_DATA_DIR</key><string>$DATA_DIR</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DATA_DIR/server.log</string>
  <key>StandardErrorPath</key><string>$DATA_DIR/server.err.log</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  info "Loaded $PLIST"
  info "Manage with: launchctl unload/load \"$PLIST\""

elif [ "$OS" = "Linux" ]; then
  bold "2/3  Installing systemd --user service"
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/claude-remote.service" <<EOF
[Unit]
Description=Claude Remote server
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$SERVER_DIR
Environment=PATH=$SERVICE_PATH
Environment=CLAUDE_REMOTE_DATA_DIR=$DATA_DIR
ExecStart=$NODE_BIN $SERVER_DIR/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now claude-remote.service
  info "Enabled claude-remote.service"
  info "Start at boot even when logged out:  sudo loginctl enable-linger $USER"
  info "Logs:  journalctl --user -u claude-remote -f"
else
  echo "Unsupported OS: $OS. Build is done; run manually: node $SERVER_DIR/dist/index.js" >&2
  exit 1
fi

bold "3/3  Waiting for the server to come up…"
sleep 2
PORT="${CLAUDE_REMOTE_PORT:-8787}"
for i in $(seq 1 15); do
  if curl -s "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

TOKEN="$(node -e "try{console.log(require('$DATA_DIR/config.json').token)}catch(e){console.log('')}" 2>/dev/null || true)"
echo
bold "✅ Done. Connect the app with:"
LANIP="$(node -e "const o=require('os').networkInterfaces();for(const k in o)for(const n of o[k]||[])if(n.family==='IPv4'&&!n.internal){console.log(n.address);process.exit(0)}" 2>/dev/null || true)"
info "Server URL:  http://${LANIP:-<your-lan-ip>}:$PORT"
info "Token:       ${TOKEN:-<see $DATA_DIR/config.json>}"
echo
