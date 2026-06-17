#!/usr/bin/env bash
# Remove the Claude Remote auto-start service. Leaves data (~/.claude-remote) intact.
set -euo pipefail
LABEL="com.claude-remote.server"
OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed launchd agent."
elif [ "$OS" = "Linux" ]; then
  systemctl --user disable --now claude-remote.service 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/claude-remote.service"
  systemctl --user daemon-reload || true
  echo "Removed systemd user service."
else
  echo "Unsupported OS: $OS"
fi
echo "Data left at ~/.claude-remote (delete manually to remove the token/sessions)."
