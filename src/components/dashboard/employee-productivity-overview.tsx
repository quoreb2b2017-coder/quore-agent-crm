import { Coffee, Timer, TrendingUp } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductivityChart } from "@/components/dashboard/productivity-chart";
import { addDaysIso, eachDateInclusive, formatDuration, todayIso, weekdayShortIst } from "@/lib/format";
import { dailyActiveSeconds } from "@/lib/live-time";
import { PRODUCTIVE_SECONDS, productivityPercent } from "@/lib/shift";
import { liveSessionSlices } from "@/lib/queries/admin-dashboard";

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

  const [{ data: rows }, live] = await Promise.all([
    supabase
      .from("attendance")
      .select("attendance_date, total_active_seconds, total_break_seconds")
      .eq("employee_id", employeeId)
      .gte("attendance_date", sinceIso)
      .order("attendance_date"),
    liveSessionSlices(supabase, [employeeId]),
  ]);

  const byDate = new Map((rows ?? []).map((row) => [row.attendance_date, row]));
  const slice = live.get(employeeId);
  const todayRow = byDate.get(today);
  const totalActive = dailyActiveSeconds({
    storedActiveSeconds: todayRow?.total_active_seconds ?? 0,
    sessionStartedAt: slice?.sessionStartedAt ?? null,
    sessionClosedBreakSeconds: slice?.sessionClosedBreakSeconds ?? 0,
    openBreakStartedAt: slice?.openBreakStartedAt ?? null,
  });
  const totalBreak = todayRow?.total_break_seconds ?? 0;

  const chartData = eachDateInclusive(sinceIso, today).map((iso) => {
    const seconds = iso === today ? totalActive : (byDate.get(iso)?.total_active_seconds ?? 0);
    return { day: weekdayShortIst(iso), activeHours: Math.round((seconds / 3600) * 10) / 10 };
  });

  const who = employeeName ? `${employeeName} — ` : "";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`${who}Productive today`}
          value={formatDuration(totalActive)}
          icon={Timer}
          tone="success"
          hint={`of ${formatDuration(PRODUCTIVE_SECONDS)}`}
        />
        <StatCard label="Break today" value={formatDuration(totalBreak)} icon={Coffee} tone="warning" />
        <StatCard label="Productivity" value={`${productivityPercent(totalActive)}%`} icon={TrendingUp} tone="info" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{who}Last 7 shifts — productive hours</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductivityChart data={chartData} />
        </CardContent>
      </Card>
    </>
  );
}
