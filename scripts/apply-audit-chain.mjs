/**
 * Applies 0037_audit_chain_verify.sql to the linked DATABASE_URL.
 *   npx tsx scripts/apply-audit-chain.mjs
 *
 * If this machine has no IPv6 / pooler access, paste the SQL file into
 * Supabase Dashboard → SQL Editor → Run instead.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { Client } from "pg";
import dns from "dns/promises";

config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "0037_audit_chain_verify.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const parsed = new URL(raw.replace(/^postgresql:/, "http:"));
const password = decodeURIComponent(parsed.password);
const user = parsed.username;
const hostName = parsed.hostname;

async function tryClient(opts, label) {
  const c = new Client({
    ...opts,
    ssl: { rejectUnauthorized: false, ...(opts.ssl || {}) },
    connectionTimeoutMillis: 15000,
  });
  try {
    await c.connect();
    console.log("Connected via", label);
    await c.query(sql);
    const v = await c.query("select count(*)::int as n from public.verify_audit_chain(1)");
    console.log("verify_audit_chain OK, broken links:", v.rows[0]?.n ?? 0);
    await c.end();
    return true;
  } catch (e) {
    console.log("Fail", label, "-", e.message.slice(0, 140));
    try {
      await c.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const attempts = [];

// Direct URL as-is
attempts.push(() => tryClient({ connectionString: raw }, "DATABASE_URL"));

// IPv6 literal if AAAA exists
try {
  const aaaa = await dns.resolve6(hostName);
  if (aaaa[0]) {
    attempts.push(() =>
      tryClient(
        {
          host: aaaa[0],
          port: Number(parsed.port || 5432),
          user,
          password,
          database: "postgres",
          ssl: { servername: hostName },
        },
        `IPv6 ${aaaa[0]}`
      )
    );
  }
} catch {
  /* no AAAA */
}

const ref = hostName.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
if (ref) {
  for (const region of ["ap-south-1", "ap-southeast-1", "us-east-1", "eu-west-1"]) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    attempts.push(() =>
      tryClient(
        {
          host,
          port: 6543,
          user: `postgres.${ref}`,
          password,
          database: "postgres",
        },
        `pooler ${region}`
      )
    );
  }
}

for (const run of attempts) {
  if (await run()) process.exit(0);
}

console.error(`
Could not reach Postgres from this machine (IPv6-only DB / pooler tenant).

Do this instead:
1. Open https://supabase.com/dashboard/project/${ref || "YOUR_REF"}/sql/new
2. Paste contents of supabase/migrations/0037_audit_chain_verify.sql
3. Click Run
4. Refresh /admin/audit-logs and click Verify integrity
`);
process.exit(1);
