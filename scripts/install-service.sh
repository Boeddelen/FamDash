#!/usr/bin/env bash
# Install the Family Dashboard as a per-user launchd service that starts at login
# and restarts on crash. Re-run this after pulling updates.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.slikroad.familydashboard"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
NODE_BIN="$(command -v node || true)"
PORT="${PORT:-4174}"

if [ -z "$NODE_BIN" ]; then
	echo "error: node not found on PATH" >&2
	exit 1
fi

cd "$REPO_DIR"

if [ ! -f .env ] && [ -f .env.example ]; then
	cp .env.example .env
	echo "==> Created .env from .env.example (edit it to change the port etc.)"
fi

if [ ! -d node_modules ]; then
	echo "==> Installing dependencies"
	npm install
fi

echo "==> Building"
npm run build

echo "==> Applying database migrations"
npm run db:migrate

mkdir -p "$HOME/Library/LaunchAgents" "$REPO_DIR/data/logs"

echo "==> Writing $PLIST"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${NODE_BIN}</string>
		<string>--env-file-if-exists=.env</string>
		<string>build/index.js</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${REPO_DIR}</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>NODE_ENV</key><string>production</string>
		<key>PORT</key><string>${PORT}</string>
		<key>HOST</key><string>0.0.0.0</string>
		<key>BODY_SIZE_LIMIT</key><string>16M</string>
		<key>DATA_DIR</key><string>${REPO_DIR}/data</string>
		<key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${REPO_DIR}/data/logs/dashboard.out.log</string>
	<key>StandardErrorPath</key>
	<string>${REPO_DIR}/data/logs/dashboard.err.log</string>
</dict>
</plist>
PLISTEOF

echo "==> (Re)loading service"
DOMAIN="gui/$(id -u)"
# Always a full unload+reload, not `kickstart -k`: kickstart restarts the process but
# keeps launchd's already-loaded copy of the environment variables, so a changed PORT
# (or DATA_DIR, etc.) in the plist we just wrote would silently never take effect.
if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
	launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
	sleep 1
fi
launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

ok=0
for _ in $(seq 1 20); do
	if curl -fsS -m 3 "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then ok=1; break; fi
	sleep 1
done
if [ "$ok" = "1" ]; then
	echo ""
	echo "✅ Family Dashboard is running:  http://localhost:${PORT}"
	IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
	[ -z "$IP" ] && IP="$(ipconfig getifaddr "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" 2>/dev/null || true)"
	[ -n "$IP" ] && echo "   On your network:            http://${IP}:${PORT}"
	echo "   Or by name:                 http://$(scutil --get LocalHostName 2>/dev/null || hostname).local:${PORT}"
	echo "   Logs:  $REPO_DIR/data/logs/"
	echo "   Stop:  npm run service:uninstall"
else
	echo "⚠️  Service loaded but health check failed. Check data/logs/dashboard.err.log" >&2
	exit 1
fi
