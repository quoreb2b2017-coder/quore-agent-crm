# Quore Supabase backup (Mac mini)

Reliable **hourly** database + Storage backup with **automatic missed-run recovery**.  
Standalone toolkit — **does not modify** the production Next.js app, RLS, schema, auth, or Vercel deploy.

## Independent of the Next.js app

| Myth | Reality |
|---|---|
| Need `npm run dev` / `npm start` | **No.** launchd runs `node …/run.mjs` directly |
| Need Cursor / VS Code open | **No.** agents live under LaunchAgents + Application Support |
| Need the git folder open | **No.** `install.sh` copies the toolkit to `~/Library/Application Support/quore-supabase-backup/toolkit` |
| Manual Terminal every hour | **No.** hourly `StartInterval` + startup `RunAtLoad` |

Credentials and backup files stay under Application Support, not inside the Next app.

## What it does

| Requirement | Behavior |
|---|---|
| Hourly DB | Fresh `pg_dump` (custom format) every successful cycle; prior snapshots kept |
| Hourly Storage | Incremental sync of every bucket/object; exact paths preserved |
| Missed hours | Detected on next run; one catch-up of **latest** DB + all pending/failed Storage |
| Incomplete work | Never sets `lastSuccessfulRunAt`; partial downloads never overwrite verified files |
| Locks | PID lock prevents overlapping launchd jobs |
| Retries | Exponential backoff for network / 5xx / rate limits; waits for internet |
| Wake / reboot | `RunAtLoad` + startup agent re-run recovery |
| Stay awake | Optional `caffeinate` launch agent |
| Reports | JSON + Markdown after every run |

## Layout

```text
ops/supabase-backup/
  src/run.mjs              # main runner
  src/status.mjs
  src/verify-local.mjs
  src/lib/                 # state, lock, db, storage, report, retry
  macos/install.sh         # launchd + caffeinate
  macos/uninstall.sh
  tests/acceptance-checklist.md
  RESTORE.md
  .env.example
```

Backup data (default on Mac):

```text
~/Library/Application Support/quore-supabase-backup/
  credentials.env          # secrets — chmod 600, outside git
  backups/
    database/postgres-*.dump (+ .meta.json)
    storage/<bucket>/<exact/path>
    state/backup-state.json
    reports/latest.json
    logs/
```

## Mac mini setup

### 1. Prerequisites

- Node.js 20+
- `pg_dump` (`brew install libpq && brew link --force libpq`)
- Network access to Supabase DB + API

### 2. Credentials (never in frontend / never commit)

```bash
mkdir -p "$HOME/Library/Application Support/quore-supabase-backup"
cp .env.example "$HOME/Library/Application Support/quore-supabase-backup/credentials.env"
chmod 600 "$HOME/Library/Application Support/quore-supabase-backup/credentials.env"
# Edit: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL (direct/session, not transaction pooler)
```

### 3. Install background scheduler (once)

```bash
cd ops/supabase-backup
chmod +x macos/*.sh
./macos/install.sh
```

This will:

1. Copy the toolkit to `~/Library/Application Support/quore-supabase-backup/toolkit`
2. Install LaunchAgents (hourly + startup recovery + caffeinate)
3. Start the hourly agent immediately in the background
4. Install operator CLIs under `~/bin` and `…/bin/`

Also: **System Settings → Energy** — prevent Mac mini from sleeping when display is off.

After install you can close Cursor, quit Terminal, and leave the Next.js app stopped — backups keep running.

### 4. Operator commands (no Next.js)

```bash
# Scheduler loaded? last success? pending work?
quore-backup-status
# or: ./macos/status.sh

# Recent runs + latest report JSON
quore-backup-history
# or: ./macos/history.sh

# Tail backup + launchd logs
quore-backup-logs
# or: ./macos/logs.sh

# Manually trigger one backup now
quore-backup-run
# or: ./macos/run-now.sh

# Kick via launchd (same background path as hourly)
launchctl kickstart -k "gui/$(id -u)/com.quore.supabase-backup.hourly"
```

If `quore-backup-*` is not found, either open a new terminal or:

```bash
export PATH="$HOME/bin:$PATH"
```

### 5. Optional local verify (toolkit copy)

```bash
export BACKUP_ENV_FILE="$HOME/Library/Application Support/quore-supabase-backup/credentials.env"
cd "$HOME/Library/Application Support/quore-supabase-backup/toolkit"
npm run verify-local
```

## Safety rules (enforced by design)

- Production data is **read-only** (dump + Storage download).
- Successful backups are **never auto-deleted**.
- Downloads write `*.partial` first; rename only after size + SHA-256 checks.
- Service role key lives only in `credentials.env` / `BACKUP_ENV_FILE`.
- Restore only into a **test** project — see `RESTORE.md`.

## Reports

Each run writes:

- `reports/report-<id>.json`
- `reports/report-<id>.md`
- `reports/latest.json`

Fields include database status, Storage sync status, downloaded / modified / pending / failed / recovered counts, verification flags, and last successful backup timestamp.

## Acceptance tests

See [`tests/acceptance-checklist.md`](./tests/acceptance-checklist.md) for the eight required scenarios (missed hours, offline mid-download, kill dump, reboot, path preservation, restore drills).

## Uninstall agents (keeps backup files)

```bash
./macos/uninstall.sh
```
