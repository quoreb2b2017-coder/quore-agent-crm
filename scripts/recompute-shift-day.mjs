/**
 * One-shot: recompute attendance totals for custom-shift employees on a date.
 * Usage: node scripts/recompute-shift-day.mjs 2026-11-02
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

const dateIso = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso ?? "")) {
  console.error("Usage: node scripts/recompute-shift-day.mjs YYYY-MM-DD");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function zonedWallToUtc(dateIso, hour, minute, timeZone, second = 0) {
  const guess = new Date(`${dateIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function wallToUtc(dateIso, minutes, timeZone) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return zonedWallToUtc(dateIso, hour, minute, timeZone);
}

function shiftSpansMidnight(settings) {
  return settings.logoutMinutes <= settings.loginMinutes;
}

function shiftWindowUtc(shiftDate, settings, overtimeMinutes = 0) {
  const endDate = shiftSpansMidnight(settings) ? addDaysIso(shiftDate, 1) : shiftDate;
  const end = wallToUtc(endDate, settings.logoutMinutes, settings.timeZone);
  const extraMs = Math.max(0, Math.floor(overtimeMinutes)) * 60_000;
  return {
    start: wallToUtc(shiftDate, settings.loginMinutes, settings.timeZone),
    end: extraMs > 0 ? new Date(end.getTime() + extraMs) : end,
  };
}

function shiftAccountingWindowUtc(shiftDate, settings) {
  if (!shiftSpansMidnight(settings)) {
    return {
      start: wallToUtc(shiftDate, 0, settings.timeZone),
      end: wallToUtc(addDaysIso(shiftDate, 1), 0, settings.timeZone),
    };
  }
  return {
    start: wallToUtc(shiftDate, settings.logoutMinutes, settings.timeZone),
    end: wallToUtc(addDaysIso(shiftDate, 1), settings.logoutMinutes, settings.timeZone),
  };
}

function creditedWorkBounds(startedAt, endedAt, settings, overtimeMinutes = 0) {
  const start = new Date(startedAt);
  const endAt = new Date(endedAt);
  const { start: official, end } = shiftWindowUtc(dateIso, settings, overtimeMinutes);
  const from = Math.max(start.getTime(), official.getTime());
  const to = Math.min(endAt.getTime(), end.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}

function breakDurationSeconds(row, nowMs) {
  if (row.ended_at == null) return Math.max(0, Math.floor((nowMs - new Date(row.started_at).getTime()) / 1000));
  if (row.duration_seconds != null) return Math.max(0, row.duration_seconds);
  return Math.max(0, Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000));
}

function creditedAwaySeconds(sessionStartedAt, row, nowMs, settings, overtimeMinutes = 0) {
  const sessionStart = new Date(sessionStartedAt);
  const { start: official, end } = shiftWindowUtc(dateIso, settings, overtimeMinutes);
  const windowFrom = Math.max(sessionStart.getTime(), official.getTime());
  const startedAt = new Date(row.started_at).getTime();
  const endedAt = startedAt + breakDurationSeconds(row, nowMs) * 1000;
  const from = Math.max(startedAt, windowFrom);
  const to = Math.min(endedAt, end.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}

const { data: companyRow } = await supabase
  .from("app_settings")
  .select("login_minutes, logout_minutes, time_zone")
  .limit(1)
  .maybeSingle();

const company = {
  loginMinutes: companyRow.login_minutes,
  logoutMinutes: companyRow.logout_minutes,
  timeZone: companyRow.time_zone || "Asia/Kolkata",
};

const { data: employees } = await supabase
  .from("employees")
  .select("id, full_name, work_schedule")
  .neq("employment_status", "TERMINATED");

const targets = (employees ?? []).filter((e) => {
  const s = e.work_schedule;
  return s && typeof s === "object" && Number.isFinite(s.loginMinutes) && Number.isFinite(s.logoutMinutes);
});

console.log(`Recomputing ${dateIso} for ${targets.length} custom-shift employees…`);

for (const emp of targets) {
  const settings = {
    ...company,
    loginMinutes: emp.work_schedule.loginMinutes,
    logoutMinutes: emp.work_schedule.logoutMinutes,
    lateMinutes: (emp.work_schedule.loginMinutes + 1) % (24 * 60),
  };
  const { data: att } = await supabase
    .from("attendance")
    .select("id, status, overtime_minutes, total_active_seconds, total_break_seconds")
    .eq("employee_id", emp.id)
    .eq("attendance_date", dateIso)
    .maybeSingle();
  if (!att || ["ON_LEAVE", "HOLIDAY", "WEEK_OFF"].includes(att.status)) {
    console.log(`- skip ${emp.full_name}: ${att?.status ?? "no row"}`);
    continue;
  }
  const ot = att.overtime_minutes ?? 0;
  const { start, end } = shiftAccountingWindowUtc(dateIso, settings);
  const [{ data: sessions }, { data: breaks }, { data: washrooms }] = await Promise.all([
    supabase
      .from("employee_sessions")
      .select("id, started_at, ended_at")
      .eq("employee_id", emp.id)
      .lt("started_at", end.toISOString())
      .or(`ended_at.is.null,ended_at.gte.${start.toISOString()}`),
    supabase
      .from("breaks")
      .select("session_id, started_at, ended_at, duration_seconds")
      .eq("employee_id", emp.id)
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString()),
    supabase
      .from("washroom_visits")
      .select("session_id, started_at, ended_at, duration_seconds")
      .eq("employee_id", emp.id)
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString()),
  ]);

  const nowMs = Date.now();
  let activeSeconds = 0;
  let breakSeconds = 0;
  for (const session of sessions ?? []) {
    // Keep open sessions out of stored totals (live UI adds them).
    if (!session.ended_at) {
      const closedBreaks = (breaks ?? []).filter((row) => row.session_id === session.id && row.ended_at != null);
      breakSeconds += closedBreaks.reduce(
        (sum, row) => sum + creditedAwaySeconds(session.started_at, row, nowMs, settings, ot),
        0
      );
      continue;
    }
    const endedAt = new Date(session.ended_at);
    const sessionSeconds = creditedWorkBounds(session.started_at, endedAt, settings, ot);
    const sessionBreaks = (breaks ?? []).filter((row) => row.session_id === session.id);
    const sessionWash = (washrooms ?? []).filter((row) => row.session_id === session.id);
    const away = (rows) =>
      rows.reduce((sum, row) => sum + creditedAwaySeconds(session.started_at, row, endedAt.getTime(), settings, ot), 0);
    const breakPart = away(sessionBreaks);
    const washPart = away(sessionWash);
    breakSeconds += breakPart;
    activeSeconds += Math.max(0, sessionSeconds - breakPart - washPart);
  }

  await supabase
    .from("attendance")
    .update({
      total_active_seconds: activeSeconds,
      total_break_seconds: breakSeconds,
      overtime_minutes: ot,
    })
    .eq("id", att.id);

  const fmt = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  console.log(
    `- ${emp.full_name}: active ${fmt(att.total_active_seconds)} → ${fmt(activeSeconds)}, break ${fmt(att.total_break_seconds)} → ${fmt(breakSeconds)} (sessions=${(sessions ?? []).length})`
  );
}
