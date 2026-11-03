#!/usr/bin/env bash
# Scheduler + backup status (independent of Next.js / IDE).
set -euo pipefail
SUPPORT_DIR="$HOME/Library/Application Support/quore-supabase-backup"
BIN="$SUPPORT_DIR/bin/quore-backup-status"
if [[ -x "$BIN" ]]; then
  exec "$BIN"
fi
echo "Backup not installed yet. Run: ops/supabase-backup/macos/install.sh" >&2
exit 1
