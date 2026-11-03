# Acceptance tests — Zero-Missed-Data Backup Recovery

Run these on the Mac mini after `macos/install.sh`.  
**Never restore into production.** Use a separate Supabase test project only.

Credentials: `~/Library/Application Support/quore-supabase-backup/credentials.env`

Useful commands:

```bash
export BACKUP_ENV_FILE="$HOME/Library/Application Support/quore-supabase-backup/credentials.env"
cd /path/to/activity-track/ops/supabase-backup
npm run backup -- --manual
npm run status
npm run verify-local
```

Reports: `$BACKUP_ROOT/reports/latest.json`

---

## 1. Miss one hourly backup

1. Note `lastSuccessfulRunAt` from `npm run status`.
2. Prevent one scheduled run (unload hourly agent for ~70 minutes, or advance system clock carefully in a VM).
3. Re-enable / wait for next run (or `npm run backup -- --startup`).
4. **Expect:** report `missedHoursDetected >= 1`, fresh DB snapshot created, Storage catch-up of pending objects, run succeeds if network OK.

## 2. Miss five consecutive hourly backups

1. Leave Mac offline / agent unloaded for 5+ hours.
2. Bring online and run `npm run backup -- --startup`.
3. **Expect:** one complete catch-up (not five duplicate DB dumps in one process — one fresh dump of *current* DB + full Storage reconcile). Notes mention missed hours. Prior successful snapshots remain on disk.

## 3. Disconnect internet during file download

1. Start a backup while Storage has files to sync.
2. Disable Wi‑Fi mid-download.
3. **Expect:** failed/incomplete objects stay `failed`/`pending` in state; no verified overwrite with partial file; `*.partial` cleaned or discarded; next run with internet retries those objects.

## 4. Interrupt a database backup

1. Start backup; kill `pg_dump` / the node process during dump (`Ctrl+C` or `kill`).
2. **Expect:** no new `.dump` promoted without meta/sha; `*.partial` removed or not treated as success; `database.pendingRetry=true`; next run creates a **new** full snapshot.

## 5. Stop a Storage download halfway

1. Kill the process during a large object download.
2. **Expect:** destination verified file unchanged if it already existed; incomplete `.partial` not renamed to final; object status not `verified`; retry on next run downloads again and verifies SHA-256 + size.

## 6. Restart Mac mini after missed backups

1. Miss several hours, then reboot.
2. **Expect:** `RunAtLoad` / startup agent triggers recovery; lock prevents overlap with hourly; catch-up completes; `caffeinate` agent still loaded.

## 7. Exact folder and filename preservation

1. Upload to Storage an object with nested path and mixed case, e.g. `Docs/Q1/Invoice Final.PDF`.
2. Run backup.
3. **Expect:** local file at  
   `$BACKUP_ROOT/storage/<bucket>/Docs/Q1/Invoice Final.PDF`  
   same capitalization, spaces, extension; no flattening.

## 8. Database and Storage recovery (test project only)

### Database
1. Take a successful `.dump` from `$BACKUP_ROOT/database/`.
2. On a **test** Supabase project / local Postgres:  
   `pg_restore --clean --if-exists -d "$TEST_DATABASE_URL" /path/to/postgres-….dump`
3. **Expect:** restore completes; spot-check row counts. Never run against production.

### Storage
1. Pick verified objects from state.
2. Upload from the local mirror into a **test** bucket preserving paths, or compare SHA-256 with production download in a dry script.
3. Run `npm run verify-local` — expect `missing=0`, `mismatch=0` for verified set.

---

## Pass criteria

| Check | Required |
|---|---|
| Incomplete run never sets `lastSuccessfulRunAt` | Yes |
| Failed DB does not delete prior snapshots | Yes |
| Failed Storage object retried automatically | Yes |
| Overlap prevented by lock | Yes |
| Report includes DB + Storage metrics listed in requirements | Yes |
| Production app / RLS / schema untouched | Yes |
| Service role key only in credentials file outside frontend | Yes |
