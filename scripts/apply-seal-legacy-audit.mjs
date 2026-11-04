/**
 * Applies 0038_seal_legacy_audit_logs.sql (or calls seal_legacy_audit_logs if present).
 *   npx tsx scripts/apply-seal-legacy-audit.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import dns from "dns/promises";

config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "0038_seal_legacy_audit_logs.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const existing = await sb.rpc("seal_legacy_audit_logs");
if (!existing.error) {
  console.log("Sealed via RPC:", existing.data);
  process.exit(0);
}
console.log("RPC not ready:", existing.error.message);

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("Run supabase/migrations/0038_seal_legacy_audit_logs.sql in SQL Editor.");
  process.exit(1);
}

const parsed = new URL(raw.replace(/^postgresql:/, "http:"));
const password = decodeURIComponent(parsed.password);
const user = parsed.username;
const hostName = parsed.hostname;

async function run(opts, label) {
  const c = new Client({
    ...opts,
    ssl: { rejectUnauthorized: false, ...(opts.ssl || {}) },
    connectionTimeoutMillis: 20000,
  });
  try {
    await c.connect();
    console.log("Connected", label);
    const r = await c.query(sql);
    console.log("Result", r[r.length - 1]?.rows ?? r.rows);
    await c.end();
    return true;
  } catch (e) {
    console.log("Fail", label, e.message.slice(0, 120));
    try {
      await c.end();
    } catch {
      /* */
    }
    return false;
  }
}

if (await run({ connectionString: raw }, "DATABASE_URL")) process.exit(0);
try {
  const aaaa = await dns.resolve6(hostName);
  if (
    aaaa[0] &&
    (await run(
      {
        host: aaaa[0],
        port: 5432,
        user,
        password,
        database: "postgres",
        ssl: { servername: hostName },
      },
      "IPv6"
    ))
  ) {
    process.exit(0);
  }
} catch {
  /* */
}

console.error(`
Paste and Run in Supabase SQL Editor:
  supabase/migrations/0038_seal_legacy_audit_logs.sql
`);
process.exit(1);
