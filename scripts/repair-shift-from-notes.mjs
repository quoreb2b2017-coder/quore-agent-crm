/**
 * Recompute past attendance days using the shift frozen in notes
 * ("Late after 2:30 PM") or first check-in — not today's company schedule.
 *
 *   npx tsx scripts/repair-shift-from-notes.mjs
 *   npx tsx scripts/repair-shift-from-notes.mjs --since 2026-11-01
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  applyWorkSchedule,
  DEFAULT_WORK_SETTINGS,
  inferScheduleForAttendanceDay,
} from "../src/lib/work-settings.ts";
import {
  allocateOvertime,
  creditedAwaySeconds,
  creditedWorkBounds,
  productiveTargetSeconds,
  shiftAccountingWindowUtc,
  softOvertimeMinutes,
} from "../src/lib/shift.ts";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sinceArg = process.argv.includes("--since")
  ? process.argv[process.argv.indexOf("--since") + 1]
  : "2026-10-01";

async function loadCompany() {
  const { data } = await sb.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_WORK_SETTINGS;
  return {
    timeZone: data.time_zone || DEFAULT_WORK_SETTINGS.timeZone,
    loginMinutes: data.login_minutes,
    logoutMinutes: data.logout_minutes,
    lateMinutes: data.late_minutes,
    annualPaidLeaveDays: data.annual_paid_leave_days ?? 18,
  };
}

async function repairRow(att, company) {
  const inferred = inferScheduleForAttendanceDay(company, att);
  if (!inferred) return null;

  // Already snapshotted to the same shift — still recompute if totals look clipped
  // against that window, but skip when snapshot already matches inferred and we
  // only want to fix wrong current-schedule clips.
  const settings = applyWorkSchedule(company, inferred);
  const softOt = softOvertimeMinutes(att.overtime_minutes ?? 0);
  const { start, end } = shiftAccountingWindowUtc(att.attendance_date, settings);
  const endWithOt = new Date(end.getTime() + softOt * 60_000);

  const [{ data: sessions }, { data: breaks }, { data: washrooms }] = await Promise.all([
    sb
      .from("employee_sessions")
      .select("id, started_at, ended_at")
      .eq("employee_id", att.employee_id)
      .lt("started_at", endWithOt.toISOString())
      .or(`ended_at.is.null,ended_at.gte.${start.toISOString()}`),
    sb
      .from("breaks")
      .select("session_id, started_at, ended_at, duration_seconds")
      .eq("employee_id", att.employee_id)
      .gte("started_at", start.toISOString())
      .lt("started_at", endWithOt.toISOString()),
    sb
      .from("washroom_visits")
      .select("session_id, started_at, ended_at, duration_seconds")
      .eq("employee_id", att.employee_id)
      .gte("started_at", start.toISOString())
      .lt("started_at", endWithOt.toISOString()),
  ]);

  let shiftProductive = 0;
  let softProductive = 0;
  let breakSeconds = 0;
  const breakRows = breaks ?? [];
  const washRows = washrooms ?? [];

  for (const session of sessions ?? []) {
    if (!session.ended_at) continue;
    const endedAtMs = new Date(session.ended_at).getTime();
    const sessionBreaks = breakRows.filter((r) => r.session_id === session.id);
    const sessionWash = washRows.filter((r) => r.session_id === session.id);
    const awayAt = (ot) => (rows) =>
      rows.reduce(
        (sum, row) => sum + creditedAwaySeconds(session.started_at, row, endedAtMs, settings, ot),
        0
      );
    const netAt = (ot) => {
      const seconds = creditedWorkBounds(session.started_at, new Date(endedAtMs), settings, ot)
        .seconds;
      return Math.max(0, seconds - awayAt(ot)(sessionBreaks) - awayAt(ot)(sessionWash));
    };
    breakSeconds += awayAt(softOt)(sessionBreaks.filter((r) => r.ended_at != null));
    shiftProductive += netAt(0);
    softProductive += netAt(softOt);
  }

  const allocation = allocateOvertime({
    shiftProductiveSeconds: shiftProductive,
    postLogoutSeconds: Math.max(0, softProductive - shiftProductive),
    targetSeconds: productiveTargetSeconds(att.status),
    approvedOvertimeMinutes: att.overtime_minutes ?? 0,
  });

  if (
    allocation.productiveSeconds === att.total_active_seconds &&
    att.shift_login_minutes === inferred.loginMinutes &&
    att.shift_logout_minutes === inferred.logoutMinutes
  ) {
    return null;
  }

  const { error } = await sb
    .from("attendance")
    .update({
      total_active_seconds: allocation.productiveSeconds,
      total_break_seconds: breakSeconds,
      overtime_pending_minutes: allocation.pendingOvertimeMinutes,
      shift_login_minutes: inferred.loginMinutes,
      shift_logout_minutes: inferred.logoutMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", att.id);

  if (error) throw new Error(error.message);
  return {
    date: att.attendance_date,
    employeeId: att.employee_id,
    before: att.total_active_seconds,
    after: allocation.productiveSeconds,
    login: inferred.loginMinutes,
  };
}

const company = await loadCompany();
const { data: rows, error } = await sb
  .from("attendance")
  .select(
    "id, employee_id, attendance_date, first_check_in, notes, status, total_active_seconds, overtime_minutes, shift_login_minutes, shift_logout_minutes"
  )
  .gte("attendance_date", sinceArg)
  .not("status", "in", "(ON_LEAVE,HOLIDAY,WEEK_OFF)")
  .not("first_check_in", "is", null)
  .order("attendance_date");

if (error) {
  console.error(error);
  process.exit(1);
}

let fixed = 0;
for (const row of rows ?? []) {
  // Skip today — live clock owns it.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: company.timeZone });
  if (row.attendance_date >= today) continue;

  try {
    const result = await repairRow(row, company);
    if (result) {
      fixed += 1;
      console.log(
        `${result.date} ${result.employeeId.slice(0, 8)}… ${Math.floor(result.before / 60)}m → ${Math.floor(result.after / 60)}m (login ${result.login})`
      );
    }
  } catch (e) {
    console.error(row.attendance_date, row.employee_id, e.message);
  }
}
console.log(`Done. Fixed ${fixed} day(s) since ${sinceArg}.`);
