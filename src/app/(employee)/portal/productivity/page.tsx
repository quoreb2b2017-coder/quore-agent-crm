import { Timer, Coffee, TrendingUp } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductivityChart } from "@/components/dashboard/productivity-chart";
import { addDaysIso, eachDateInclusive, formatDuration, shiftWindowLabel, todayIso, weekdayShortIst } from "@/lib/format";
import { PRODUCTIVE_HOURS_LABEL, PRODUCTIVE_SECONDS, productivityPercent } from "@/lib/shift";

export default async function MyProductivityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const today = todayIso();
  const sinceIso = addDaysIso(today, -6);

  const { data: rows } = await supabase
    .from("attendance")
    .select("attendance_date, total_active_seconds, total_break_seconds")
    .eq("employee_id", ctx.employeeId)
    .gte("attendance_date", sinceIso)
    .order("attendance_date");

  const byDate = new Map((rows ?? []).map((r) => [r.attendance_date, r]));
  const chartData = eachDateInclusive(sinceIso, today).map((iso) => {
    const row = byDate.get(iso);
    return {
      day: weekdayShortIst(iso),
      activeHours: row ? Math.round((row.total_active_seconds / 3600) * 10) / 10 : 0,
    };
  });

  const todayRow = rows?.find((r) => r.attendance_date === today);
  const totalActive = todayRow?.total_active_seconds ?? 0;
  const totalBreak = todayRow?.total_break_seconds ?? 0;
  const productivityPct = productivityPercent(totalActive);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productivity"
        description={`${shiftWindowLabel()} · target ${PRODUCTIVE_HOURS_LABEL} productive of 9 hrs`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Productive today"
          value={formatDuration(totalActive)}
          icon={Timer}
          tone="success"
          hint={`of ${formatDuration(PRODUCTIVE_SECONDS)}`}
        />
        <StatCard label="Break today" value={formatDuration(totalBreak)} icon={Coffee} tone="warning" />
        <StatCard label="Productivity" value={`${productivityPct}%`} icon={TrendingUp} tone="info" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 7 shifts — productive hours</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductivityChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
