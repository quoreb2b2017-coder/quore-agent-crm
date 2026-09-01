import { Users, CalendarCheck, Timer, Coffee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { MeterRow } from "@/components/dashboard/mix-bar";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { StaffDashboard } from "@/components/dashboards/staff-dashboard";
import { requireViewer } from "@/lib/permissions/server";
import { greetingForNow, INDIA_TIME_ZONE } from "@/lib/format";
import { getAdminDashboardData } from "@/lib/queries/admin-dashboard";
import { getEmployeeDashboardBundle, getMySessionState } from "@/lib/queries/employee-status";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { isUuid } from "@/lib/attendance-period";
import { EmployeeWatchSelect } from "./employee-watch-select";
import { TeamTodayReport } from "./team-today-report";

export async function AdminDashboardBody({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { ctx, seesAll } = await requireViewer();
  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });

  if (!seesAll) {
    const { sessionState, commonData } = await getEmployeeDashboardBundle(ctx.employeeId);

    return (
      <StaffDashboard
        compact
        greeting={greetingForNow()}
        firstName={ctx.fullName.split(" ")[0] ?? "there"}
        roleLabel={ctx.roleDisplayName}
        subtitle={todayLabel}
        sessionState={sessionState}
        commonData={commonData}
      />
    );
  }

  const requested = Array.isArray(searchParams.employee) ? searchParams.employee[0] : searchParams.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;

  const [dashboard, watchedSession] = await Promise.all([
    getAdminDashboardData(),
    requestedId ? getMySessionState(requestedId) : Promise.resolve(null),
  ]);
  const { stats, employees, teamReport } = dashboard;

  const selected = employees.find((employee) => employee.id === requestedId) ?? null;
  const session = selected ? watchedSession : null;
  const reportRows = requestedId ? [] : teamReport;

  const firstName = ctx.fullName.split(" ")[0] ?? "Admin";
  const attendancePct =
    stats.totalEmployees > 0
      ? Math.round((stats.todaysAttendance / stats.totalEmployees) * 100)
      : 0;
  const hourScale = Math.max(
    8,
    stats.totalWorkingHours,
    stats.totalBreakHours,
    stats.totalIdleHours,
    0.1
  );

  return (
    <div className="dash-board flex flex-col">
      <DashboardPanel
        hero={
          <DashboardHero
            compact
            flush
            greeting={greetingForNow()}
            firstName={firstName}
            subtitle={todayLabel}
          />
        }
        left={
          <div className="session-card">
            <div className="session-card-head flex shrink-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{selected ? "Employee session" : "Today's report"}</p>
                <p className="text-xs text-white/70">
                  {selected ? "View only · Super Admin is not tracked" : "All employees · pick someone for session detail"}
                </p>
              </div>
              <div className="sm:w-64">
                <EmployeeWatchSelect employees={employees} employeeId={selected?.id ?? null} />
              </div>
            </div>
            {selected && session ? (
              <ClockWidget compact readOnly embedded session={session} />
            ) : (
              <TeamTodayReport rows={reportRows} />
            )}
          </div>
        }
        right={
          <Card className="dash-hours gap-0 rounded-none py-0 ring-0">
            <CardHeader className="hours-card-head flex flex-col justify-center rounded-none border-0 py-3">
              <CardTitle className="text-sm font-semibold text-white">Today&apos;s hours</CardTitle>
              <p className="text-xs text-white/70">Team working, break, and idle time</p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col justify-evenly gap-2 py-3">
              <MeterRow
                compact
                className="flex-1 justify-center"
                tone="success"
                label="Working"
                value={stats.totalWorkingHours}
                max={hourScale}
                barClass="bg-success"
              />
              <MeterRow
                compact
                className="flex-1 justify-center"
                tone="warning"
                label="Break"
                value={stats.totalBreakHours}
                max={hourScale}
                barClass="bg-warning"
              />
              <MeterRow
                compact
                className="flex-1 justify-center"
                tone="info"
                label="Idle"
                value={stats.totalIdleHours}
                max={hourScale}
                barClass="bg-info"
              />
            </CardContent>
          </Card>
        }
        footer={
          <section className="dash-stage-stats">
            <StatCard
              compact
              packed
              label="Team size"
              value={stats.totalEmployees}
              icon={Users}
              tone="info"
              hint={`${stats.onlineEmployees} online now`}
            />
            <StatCard
              compact
              packed
              label="Present today"
              value={stats.todaysAttendance}
              icon={CalendarCheck}
              tone="success"
              hint={`${attendancePct}% attendance`}
              progress={attendancePct}
            />
            <StatCard
              compact
              packed
              label="Working hours"
              value={`${stats.totalWorkingHours}h`}
              icon={Timer}
              hint="Active time this shift"
            />
            <StatCard
              compact
              packed
              label="Break hours"
              value={`${stats.totalBreakHours}h`}
              icon={Coffee}
              tone="warning"
              hint={`${stats.totalIdleHours}h idle`}
            />
          </section>
        }
      />
    </div>
  );
}
