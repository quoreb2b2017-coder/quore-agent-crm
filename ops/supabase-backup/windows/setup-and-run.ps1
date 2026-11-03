# Windows manual backup test (no Next.js / no launchd).
# Mac launchd setup can be done later with macos/install.sh
$ErrorActionPreference = "Stop"

$Support = Join-Path $env:LOCALAPPDATA "quore-supabase-backup"
$Creds = Join-Path $Support "credentials.env"
$BackupRoot = Join-Path $Support "backups"
$Toolkit = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# $PSScriptRoot = .../ops/supabase-backup/windows → toolkit is .../ops/supabase-backup
$Toolkit = Split-Path $PSScriptRoot -Parent

New-Item -ItemType Directory -Force -Path $Support, $BackupRoot,
  (Join-Path $BackupRoot "state"),
  (Join-Path $BackupRoot "reports"),
  (Join-Path $BackupRoot "logs"),
  (Join-Path $BackupRoot "database"),
  (Join-Path $BackupRoot "storage") | Out-Null

if (-not (Test-Path $Creds)) {
  Write-Host "Create credentials first:"
  Write-Host "  $Creds"
  Write-Host "See windows/credentials.env.example"
  exit 1
}

$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if (-not (Test-Path $PgDump)) {
  $PgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue)?.Source
}
if (-not $PgDump) {
  Write-Host "pg_dump not found. Install PostgreSQL client tools."
  exit 1
}

$env:BACKUP_ENV_FILE = $Creds
$env:PG_DUMP_BIN = $PgDump
$env:PATH = "C:\Program Files\PostgreSQL\18\bin;" + $env:PATH

Push-Location $Toolkit
try {
  if (-not (Test-Path "node_modules")) {
    npm install --omit=dev
  }
  node src/run.mjs --manual
  Write-Host ""
  Write-Host "Status:"
  node src/status.mjs
  Write-Host ""
  Write-Host "Backup folder: $BackupRoot"
} finally {
  Pop-Location
}
