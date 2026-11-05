import { createDataClient as createClient } from "@/lib/supabase/data";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Panel } from "@/components/wt/panel";
import { ProductivityChart } from "@/components/dashboard/productivity-chart";
import {
  addDaysIso,
  eachDateInclusive,
  formatBreakDuration,
  formatDuration,
  formatExcess,
  todayIso,
  weekdayShortIst,
} from "@/lib/format";
import { dailyActiveSeconds } from "@/lib/live-time";
import {
  creditedProductiveSeconds,
  PRODUCTIVE_SECONDS,
  productiveTargetSeconds,
} from "@/lib/shift";
import { liveSessionSlices } from "@/lib/queries/admin-dashboard";
import { loadEffectiveWorkSettings } from "@/lib/work-settings-server";

/** Today's numbers and the last 7 shifts for one employee — the same view the employee sees. */
export async function EmployeeProductivityOverview({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  /** Shown in the headings when an admin is looking at someone else. */
  employeeName?: string;
}) {
  const supabase = await createClient();
  const today = todayIso();
  const sinceIso = addDaysIso(today, -6);

  const [{ data: rows }, live, workSettings] = await Promise.all([
    supabase
      .from("attendance")
      .select("attendance_date, status, total_active_seconds, total_break_seconds, overtime_minutes")
      .eq("employee_id", employeeId)
      .gte("attendance_date", sinceIso)
      .order("attendance_date"),
    liveSessionSlices(supabase, [employeeId]),
    loadEffectiveWorkSettings(employeeId),
  ]);

  const byDate = new Map((rows ?? []).map((row) => [row.attendance_date, row]));
  const slice = live.get(employeeId);
  const todayRow = byDate.get(today);
  const totalActive = dailyActiveSeconds({
    storedActiveSeconds: todayRow?.total_active_seconds ?? 0,
    sessionStartedAt: slice?.sessionStartedAt ?? null,
    sessionClosedBreakSeconds: slice?.sessionClosedBreakSeconds ?? 0,
    openBreakStartedAt: slice?.openBreakStartedAt ?? null,
    sessionClosedWashroomSeconds: slice?.sessionClosedWashroomSeconds ?? 0,
    openWashroomStartedAt: slice?.openWashroomStartedAt ?? null,
    settings: workSettings,
    overtimeMinutes: todayRow?.overtime_minutes ?? 0,
  });
  const totalBreak = todayRow?.total_break_seconds ?? 0;
  const excessToday = slice?.breakExcess.total ?? 0;

  const creditedToday = creditedProductiveSeconds(totalActive, todayRow?.status);
  const offStatuses = new Set(["ON_LEAVE", "HOLIDAY", "WEEK_OFF"]);
  const chartData = eachDateInclusive(sinceIso, today).map((iso) => {
    const row = byDate.get(iso);
    const seconds = iso === today ? totalActive : (row?.total_active_seconds ?? 0);
    const credited = creditedProductiveSeconds(seconds, row?.status);
    const targetSeconds = productiveTargetSeconds(row?.status);
    const targetHours = Math.round((targetSeconds / 3600) * 100) / 100;
    const off = row && offStatuses.has(row.status);
    const status = off
      ? ("off" as const)
      : iso === today
        ? credited >= targetSeconds
          ? ("met" as const)
          : ("in_progress" as const)
        : credited >= targetSeconds
          ? ("met" as const)
          : credited > 0 || row
            ? ("short" as const)
            : ("upcoming" as const);
    const otHours = Math.round(((row?.overtime_minutes ?? 0) / 60) * 10) / 10;
    return {
      day: weekdayShortIst(iso),
      activeHours: Math.round((credited / 3600) * 10) / 10,
      otHours,
      targetHours: off ? Math.round((PRODUCTIVE_SECONDS / 3600) * 100) / 100 : targetHours,
      status,
    };
  });

  const who = employeeName ? `${employeeName} — ` : "";

  return (
    <>
      <dl className="grid grid-cols-2 border bg-card xl:grid-cols-2">
        <SheetKpi
          label={`${who}Productive today`}
          value={formatDuration(creditedToday)}
          valueClassName="text-success"
          hint={`of ${formatDuration(productiveTargetSeconds(todayRow?.status))}${todayRow?.status === "HALF_DAY" ? " · half day" : ""}`}
        />
        <SheetKpi
          label="Break today"
          value={formatBreakDuration(totalBreak)}
          valueClassName={excessToday > 0 ? "text-destructive" : undefined}
          hint={excessToday > 0 ? `Excess break +${formatExcess(excessToday)}` : "No excess break"}
          hintClassName={excessToday > 0 ? "font-medium text-destructive" : undefined}
        />
      </dl>

      <Panel id="last-7-shifts" className="rounded-none" bodyClassName="p-4" title={`${who}Last 7 shifts — productive hours`}>
        <ProductivityChart data={chartData} />
      </Panel>
    </>
  );
}
