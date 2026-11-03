#!/usr/bin/env bash
# Manually trigger one backup in the background path (no npm run dev).
set -euo pipefail
SUPPORT_DIR="$HOME/Library/Application Support/quore-supabase-backup"
BIN="$SUPPORT_DIR/bin/quore-backup-run"
if [[ -x "$BIN" ]]; then
  exec "$BIN" "$@"
fi
echo "Backup not installed yet. Run: ops/supabase-backup/macos/install.sh" >&2
exit 1
