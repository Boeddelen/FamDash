#!/usr/bin/env bash
# Stop and remove the Family Dashboard launchd service. Your data/ folder is left intact.
set -euo pipefail

LABEL="com.slikroad.familydashboard"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "✅ Service removed. Data kept. Reinstall with: npm run service:install"
