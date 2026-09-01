import { Users, CalendarCheck, ListChecks, CalendarDays } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIso } from "@/lib/format";
import { requireSuperAdmin } from "@/lib/permissions/server";

export default async function ReportsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { count: totalEmployees },
    { data: monthAttendance },
    { count: completedTasks },
    { count: pendingLeave },
    { data: departments },
    { data: employeesByDept },
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "ACTIVE"),
    supabase.from("attendance").select("status").gte("attendance_date", monthStart),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "DONE"),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    supabase.from("departments").select("id, name"),
    supabase.from("employees").select("department_id").eq("employment_status", "ACTIVE"),
  ]);

  const presentDays = (monthAttendance ?? []).filter((a) => a.status === "PRESENT").length;
  const totalDays = (monthAttendance ?? []).length;
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const countByDept = new Map<string, number>();
  for (const e of employeesByDept ?? []) {
    if (!e.department_id) continue;
    countByDept.set(e.department_id, (countByDept.get(e.department_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Month-to-date overview" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active Employees" value={totalEmployees ?? 0} icon={Users} />
        <StatCard label="Attendance Rate (MTD)" value={`${attendanceRate}%`} icon={CalendarCheck} tone="success" />
        <StatCard label="Tasks Completed" value={completedTasks ?? 0} icon={ListChecks} tone="info" />
        <StatCard label="Pending Leave Requests" value={pendingLeave ?? 0} icon={CalendarDays} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Headcount by Department</CardTitle>
        </CardHeader>
        <CardContent>
          {!departments || departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departments yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {departments.map((d) => {
                const count = countByDept.get(d.id) ?? 0;
                const max = Math.max(...Array.from(countByDept.values()), 1);
                return (
                  <div key={d.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm">{d.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Deeper analytics (trends, exports, custom report builder) are planned for a follow-up phase.
      </p>
    </div>
  );
}
