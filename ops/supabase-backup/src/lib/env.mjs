import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT_ROOT = path.resolve(__dirname, "../..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function firstExisting(...candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Credentials must live outside the app repo when possible.
 * Search order:
 * 1. BACKUP_ENV_FILE
 * 2. macOS Application Support
 * 3. Windows %LOCALAPPDATA%/quore-supabase-backup/credentials.env
 * 4. ~/.config/quore-supabase-backup/credentials.env
 * 5. ops/supabase-backup/.env (local/dev only — gitignored)
 */
export function loadBackupEnv() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const envFile = firstExisting(
    process.env.BACKUP_ENV_FILE,
    path.join(home, "Library/Application Support/quore-supabase-backup/credentials.env"),
    path.join(localAppData, "quore-supabase-backup", "credentials.env"),
    path.join(home, ".config/quore-supabase-backup/credentials.env"),
    path.join(TOOLKIT_ROOT, ".env")
  );

  const fileEnv = envFile ? parseEnvFile(envFile) : {};
  const get = (key, fallback = "") =>
    String(process.env[key] ?? fileEnv[key] ?? fallback).trim();

  const backupRoot =
    get("BACKUP_ROOT") ||
    path.join(home, "Library/Application Support/quore-supabase-backup/backups");
  const stateDir = get("STATE_DIR") || path.join(backupRoot, "state");
  const reportDir = get("REPORT_DIR") || path.join(backupRoot, "reports");
  const logDir = get("LOG_DIR") || path.join(backupRoot, "logs");

  const config = {
    envFile,
    toolkitRoot: TOOLKIT_ROOT,
    supabaseUrl: get("SUPABASE_URL"),
    serviceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    databaseUrl: get("DATABASE_URL"),
    backupRoot,
    stateDir,
    reportDir,
    logDir,
    dbDir: path.join(backupRoot, "database"),
    storageDir: path.join(backupRoot, "storage"),
    pgDumpBin: get("PG_DUMP_BIN", "pg_dump"),
    maxStorageRetries: Number(get("MAX_STORAGE_RETRIES", "8")) || 8,
    requestTimeoutMs: Number(get("REQUEST_TIMEOUT_MS", "120000")) || 120_000,
  };

  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(
      `Missing required backup credentials: ${missing.join(", ")}. ` +
        `Set them in ${envFile ?? "~/Library/Application Support/quore-supabase-backup/credentials.env"}`
    );
  }

  for (const dir of [
    config.backupRoot,
    config.stateDir,
    config.reportDir,
    config.logDir,
    config.dbDir,
    config.storageDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}

export { TOOLKIT_ROOT };
