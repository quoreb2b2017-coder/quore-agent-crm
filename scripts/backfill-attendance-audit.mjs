/**
 * Touches every attendance row so trg_audit_attendance writes a sealed audit entry.
 * Safe to re-run (creates another UPDATE_* row per attendance).
 *   node scripts/backfill-attendance-audit.mjs
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { count, error: countError } = await sb
  .from("attendance")
  .select("id", { count: "exact", head: true });
if (countError) throw new Error(countError.message);

console.log("attendance rows", count);
let from = 0;
const page = 50;
let touched = 0;
while (from < (count || 0)) {
  const { data, error } = await sb
    .from("attendance")
    .select("id, notes")
    .range(from, from + page - 1);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  for (const row of data) {
    const u = await sb.from("attendance").update({ notes: row.notes }).eq("id", row.id);
    if (u.error) console.error("fail", row.id, u.error.message);
    else touched++;
  }
  from += page;
  console.log(`touched ${touched}/${count}`);
}

const aud = await sb
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .eq("table_name", "attendance");
console.log("attendance audit rows", aud.count);
