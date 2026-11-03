#!/usr/bin/env bash
# Install Quore Supabase backup as an independent macOS background service (launchd).
# Does NOT depend on Next.js, npm run dev, Cursor, or VS Code being open.
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
SUPPORT_DIR="$HOME/Library/Application Support/quore-supabase-backup"
# Durable copy — survives closing the IDE / leaving the git repo unused
TOOLKIT_ROOT="$SUPPORT_DIR/toolkit"
CREDENTIALS_ENV="$SUPPORT_DIR/credentials.env"
BACKUP_ROOT="${BACKUP_ROOT:-$SUPPORT_DIR/backups}"
LOG_DIR="$BACKUP_ROOT/logs"
BIN_DIR="$SUPPORT_DIR/bin"

resolve_bin() {
  local name="$1"
  local found
  found="$(command -v "$name" || true)"
  if [[ -z "$found" ]]; then
    echo ""
    return
  fi
  # Prefer real path so launchd does not depend on shell aliases / nvm shims when possible
  if command -v realpath >/dev/null 2>&1; then
    realpath "$found"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$found"
  else
    echo "$found"
  fi
}

NODE_BIN="$(resolve_bin node)"
PG_DUMP_BIN="$(resolve_bin pg_dump)"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "ERROR: node not found. Install Node 20+ (e.g. brew install node)." >&2
  exit 1
fi
if [[ -z "$PG_DUMP_BIN" || ! -x "$PG_DUMP_BIN" ]]; then
  echo "ERROR: pg_dump not found. Install PostgreSQL client tools:" >&2
  echo "  brew install libpq && brew link --force libpq" >&2
  exit 1
fi

mkdir -p "$AGENTS_DIR" "$SUPPORT_DIR" "$BACKUP_ROOT" "$LOG_DIR" \
  "$BACKUP_ROOT/state" "$BACKUP_ROOT/reports" "$BACKUP_ROOT/database" "$BACKUP_ROOT/storage" "$BIN_DIR"

# Sync toolkit out of the repo into Application Support (rsync if available)
echo "Installing toolkit → $TOOLKIT_ROOT"
mkdir -p "$TOOLKIT_ROOT"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude backups \
    --exclude state \
    --exclude reports \
    --exclude logs \
    "$SOURCE_ROOT/" "$TOOLKIT_ROOT/"
else
  # Fallback copy
  /bin/cp -R "$SOURCE_ROOT/." "$TOOLKIT_ROOT/"
  rm -rf "$TOOLKIT_ROOT/node_modules" 2>/dev/null || true
fi

if [[ ! -f "$CREDENTIALS_ENV" ]]; then
  cp "$TOOLKIT_ROOT/.env.example" "$CREDENTIALS_ENV"
  chmod 600 "$CREDENTIALS_ENV"
  # Seed absolute paths
  {
    echo ""
    echo "BACKUP_ROOT=$BACKUP_ROOT"
    echo "STATE_DIR=$BACKUP_ROOT/state"
    echo "REPORT_DIR=$BACKUP_ROOT/reports"
    echo "LOG_DIR=$BACKUP_ROOT/logs"
  } >> "$CREDENTIALS_ENV"
  echo "Created $CREDENTIALS_ENV"
  echo "Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL — then re-run ./macos/install.sh"
  exit 1
fi

# Keep path keys present
grep -q '^BACKUP_ROOT=' "$CREDENTIALS_ENV" || echo "BACKUP_ROOT=$BACKUP_ROOT" >> "$CREDENTIALS_ENV"
grep -q '^STATE_DIR=' "$CREDENTIALS_ENV" || echo "STATE_DIR=$BACKUP_ROOT/state" >> "$CREDENTIALS_ENV"
grep -q '^REPORT_DIR=' "$CREDENTIALS_ENV" || echo "REPORT_DIR=$BACKUP_ROOT/reports" >> "$CREDENTIALS_ENV"
grep -q '^LOG_DIR=' "$CREDENTIALS_ENV" || echo "LOG_DIR=$BACKUP_ROOT/logs" >> "$CREDENTIALS_ENV"
chmod 600 "$CREDENTIALS_ENV"

cd "$TOOLKIT_ROOT"
"$NODE_BIN" "$(dirname "$NODE_BIN")/npm" install --omit=dev 2>/dev/null \
  || npm install --omit=dev

PATH_VALUE="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$(dirname "$NODE_BIN"):$(dirname "$PG_DUMP_BIN")"
RUN_JS="$TOOLKIT_ROOT/src/run.mjs"

# Operator CLIs (work with Cursor closed — no Next.js)
cat > "$BIN_DIR/quore-backup-run" <<EOF
#!/usr/bin/env bash
export BACKUP_ENV_FILE="$CREDENTIALS_ENV"
export PATH="$PATH_VALUE"
exec "$NODE_BIN" "$RUN_JS" --manual "\$@"
EOF

cat > "$BIN_DIR/quore-backup-status" <<EOF
#!/usr/bin/env bash
export BACKUP_ENV_FILE="$CREDENTIALS_ENV"
export PATH="$PATH_VALUE"
echo "=== launchd agents ==="
UID_NUM="\$(id -u)"
for label in com.quore.supabase-backup.hourly com.quore.supabase-backup.startup com.quore.supabase-backup.caffeinate; do
  if launchctl print "gui/\${UID_NUM}/\${label}" >/dev/null 2>&1; then
    echo "LOADED  \$label"
    launchctl print "gui/\${UID_NUM}/\${label}" 2>/dev/null | grep -E 'state =|runs =|last exit code =|path =|pid =' | head -20 || true
  else
    echo "MISSING \$label"
  fi
  echo
done
echo "=== backup state / history ==="
exec "$NODE_BIN" "$TOOLKIT_ROOT/src/status.mjs"
EOF

cat > "$BIN_DIR/quore-backup-history" <<EOF
#!/usr/bin/env bash
export BACKUP_ENV_FILE="$CREDENTIALS_ENV"
STATE="$BACKUP_ROOT/state/backup-state.json"
REPORT="$BACKUP_ROOT/reports/latest.json"
echo "State file: \$STATE"
if [[ -f "\$STATE" ]]; then
  "$NODE_BIN" -e 'const s=require(process.argv[1]); console.log(JSON.stringify({lastSuccessfulRunAt:s.lastSuccessfulRunAt,lastAttemptAt:s.lastAttemptAt,missedHoursDetected:s.missedHoursDetected,recentRuns:(s.runs||[]).slice(0,15)},null,2))' "\$STATE"
else
  echo "(no state yet — run a backup first)"
fi
echo
echo "Latest report: \$REPORT"
[[ -f "\$REPORT" ]] && cat "\$REPORT" || echo "(no report yet)"
EOF

cat > "$BIN_DIR/quore-backup-logs" <<EOF
#!/usr/bin/env bash
LOG_DIR="$LOG_DIR"
echo "Log directory: \$LOG_DIR"
ls -lt "\$LOG_DIR" 2>/dev/null | head -30 || echo "(empty)"
echo
echo "--- latest backup-*.log (tail) ---"
LATEST=\$(ls -t "\$LOG_DIR"/backup-*.log 2>/dev/null | head -1 || true)
if [[ -n "\$LATEST" ]]; then
  echo "\$LATEST"
  tail -n 80 "\$LATEST"
else
  echo "(no run logs yet)"
fi
echo
echo "--- launchd hourly stderr (tail) ---"
tail -n 40 "\$LOG_DIR/launchd-hourly.err.log" 2>/dev/null || echo "(none)"
EOF

chmod +x "$BIN_DIR"/quore-backup-*

# Symlink into ~/bin if present, else print PATH hint
mkdir -p "$HOME/bin"
for cmd in quore-backup-run quore-backup-status quore-backup-history quore-backup-logs; do
  ln -sf "$BIN_DIR/$cmd" "$HOME/bin/$cmd"
done

render_plist() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    -e "s|__RUN_JS__|$RUN_JS|g" \
    -e "s|__TOOLKIT_ROOT__|$TOOLKIT_ROOT|g" \
    -e "s|__CREDENTIALS_ENV__|$CREDENTIALS_ENV|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    -e "s|__PATH__|$PATH_VALUE|g" \
    "$src" > "$dest"
}

UID_NUM="$(id -u)"
HOURLY_PLIST="$AGENTS_DIR/com.quore.supabase-backup.hourly.plist"
STARTUP_PLIST="$AGENTS_DIR/com.quore.supabase-backup.startup.plist"
CAFFEINE_PLIST="$AGENTS_DIR/com.quore.supabase-backup.caffeinate.plist"

launchctl bootout "gui/${UID_NUM}/com.quore.supabase-backup.hourly" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/com.quore.supabase-backup.startup" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/com.quore.supabase-backup.caffeinate" 2>/dev/null || true

render_plist "$TOOLKIT_ROOT/macos/com.quore.supabase-backup.hourly.plist" "$HOURLY_PLIST"
render_plist "$TOOLKIT_ROOT/macos/com.quore.supabase-backup.startup.plist" "$STARTUP_PLIST"
cp "$TOOLKIT_ROOT/macos/com.quore.supabase-backup.caffeinate.plist" "$CAFFEINE_PLIST"

launchctl bootstrap "gui/${UID_NUM}" "$HOURLY_PLIST"
launchctl bootstrap "gui/${UID_NUM}" "$STARTUP_PLIST"
launchctl bootstrap "gui/${UID_NUM}" "$CAFFEINE_PLIST"

launchctl enable "gui/${UID_NUM}/com.quore.supabase-backup.hourly" 2>/dev/null || true
launchctl enable "gui/${UID_NUM}/com.quore.supabase-backup.startup" 2>/dev/null || true
launchctl enable "gui/${UID_NUM}/com.quore.supabase-backup.caffeinate" 2>/dev/null || true

# Kick an immediate background run (does not need terminal left open)
launchctl kickstart -k "gui/${UID_NUM}/com.quore.supabase-backup.hourly" 2>/dev/null || true

cat <<MSG

Installed independent background backup (no Next.js / Cursor required).

  Toolkit copy:  $TOOLKIT_ROOT
  Credentials:   $CREDENTIALS_ENV
  Backup data:   $BACKUP_ROOT
  LaunchAgents:  $HOURLY_PLIST
                 $STARTUP_PLIST
                 $CAFFEINE_PLIST

Operator commands (add ~/bin to PATH if needed):

  quore-backup-status     # launchd + last success / pending
  quore-backup-history    # recent runs + latest report
  quore-backup-logs       # tail run + launchd logs
  quore-backup-run        # manually trigger one backup now

Or full paths:
  $BIN_DIR/quore-backup-status

Also: System Settings → Energy → prevent sleep when display is off.

MSG
