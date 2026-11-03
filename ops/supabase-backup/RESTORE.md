# Restore guidance (test project only)

**Never restore into production. Never delete production data while recovering.**

## Database

Successful dumps live under `$BACKUP_ROOT/database/postgres-*.dump` (PostgreSQL custom format).

Each dump has a sibling `.meta.json` with SHA-256. Verify before restore:

```bash
shasum -a 256 postgres-….dump
# compare to meta.sha256
```

Restore into a **separate** Supabase test project or local Postgres:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$TEST_DATABASE_URL" \
  /path/to/postgres-YYYY-….dump
```

Historical DB states exist **only** for cycles that produced a verified dump.  
If a hour was missed and never captured after a schema/data change, that intermediate state cannot be reconstructed from later snapshots alone.

## Storage

Local mirror:

```text
$BACKUP_ROOT/storage/<exact-bucket>/<exact/object/path>
```

Names, folders, capitalization, and extensions are preserved.  
Re-upload to a test bucket with the same object keys (Supabase dashboard, CLI, or a one-off script). Do not flatten paths.

## Application safety

This toolkit does **not** modify:

- Next.js / Vercel app
- Auth, RLS, migrations, employee workflows
- Production Storage objects (read-only downloads)
