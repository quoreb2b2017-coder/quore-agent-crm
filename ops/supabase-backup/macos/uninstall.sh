#!/usr/bin/env bash
# Stops launchd agents only. Does not delete backups, credentials, or toolkit copy.
set -euo pipefail
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

for label in \
  com.quore.supabase-backup.hourly \
  com.quore.supabase-backup.startup \
  com.quore.supabase-backup.caffeinate
do
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  rm -f "$AGENTS_DIR/${label}.plist"
  echo "Removed $label"
done

echo "Stopped scheduler. Kept intact:"
echo "  ~/Library/Application Support/quore-supabase-backup/  (toolkit, credentials, backups, reports)"
echo "  ~/bin/quore-backup-* symlinks (optional: rm ~/bin/quore-backup-*)"
