import { Users, CalendarCheck, Timer, Coffee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { MeterRow } from "@/components/dashboard/mix-bar";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { StaffDashboard } from "@/components/dashboards/staff-dashboard";
import { requireViewer } from "@/lib/permissions/server";
import { trustedNowDate } from "@/lib/clock-anchor";
import { formatMonthLabel, greetingForNow, INDIA_TIME_ZONE, todayIso } from "@/lib/format";
import { AdminLogoutButton } from "@/components/attendance/admin-logout-button";
import { getAdminDashboardData } from "@/lib/queries/admin-dashboard";
import { sweepIdleSessions } from "@/lib/presence-server";
import { getEmployeeDashboardBundle } from "@/lib/queries/employee-status";
import { isUuid, monthStartEnd } from "@/lib/attendance-period";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { MyActivityLog } from "@/components/activity/my-activity-log";
import { buildActivityDays } from "@/lib/queries/shift-activity";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { EmployeeWatchSelect } from "./employee-watch-select";
import { TeamTodayReport } from "./team-today-report";
import { MeetingRequests } from "./meeting-requests";

export async function AdminDashboardBody({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { ctx, seesAll } = await requireViewer();
  const todayLabel = trustedNowDate().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });

  if (!seesAll) {
    const monthKey = todayIso().slice(0, 7);
    const bounds = monthStartEnd(monthKey);
    const [{ sessionState, commonData }, calendarRow, activityDays] = await Promise.all([
      getEmployeeDashboardBundle(ctx.employeeId),
      getProductivityReport(
        [{ id: ctx.employeeId, full_name: ctx.fullName, employee_code: ctx.employeeCode }],
        bounds.start,
        bounds.end
      ).then((rows) => rows[0]),
      buildActivityDays(
        {
          id: ctx.employeeId,
          fullName: ctx.fullName,
          employeeCode: ctx.employeeCode,
        },
        30
      ),
    ]);

    return (
      <>
        <StaffDashboard
          compact
          greeting={greetingForNow()}
          firstName={ctx.fullName.split(" ")[0] ?? "there"}
          roleLabel={ctx.roleDisplayName}
          subtitle={todayLabel}
          sessionState={sessionState}
          commonData={commonData}
          activity={<MyActivityLog days={activityDays} embedded />}
        />
        {calendarRow ? (
          <div className="pt-4 pb-6">
            <MonthCalendar
              title={`${formatMonthLabel(monthKey)} — ${ctx.fullName}`}
              start={bounds.start}
              end={bounds.end}
              days={calendarRow.days}
              trackingStart={calendarRow.trackingStart}
              prevHref={`/admin/productivity?view=monthly&employee=${ctx.employeeId}&month=${shiftMonth(monthKey, -1)}`}
              nextHref={`/admin/productivity?view=monthly&employee=${ctx.employeeId}&month=${shiftMonth(monthKey, 1)}`}
            />
          </div>
        ) : null}
      </>
    );
  }

  const requested = Array.isArray(searchParams.employee) ? searchParams.employee[0] : searchParams.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;

  await sweepIdleSessions();
  const dashboard = await getAdminDashboardData();
  const { stats, employees, teamReport, pendingMeetings } = dashboard;

  const selected = employees.find((employee) => employee.id === requestedId) ?? null;
  const monthKey = todayIso().slice(0, 7);
  const monthBounds = monthStartEnd(monthKey);
  if (selected) {
    const [{ sessionState, commonData }, calendarRow, activityDays] = await Promise.all([
      getEmployeeDashboardBundle(selected.id),
      getProductivityReport(
        [{ id: selected.id, full_name: selected.full_name, employee_code: selected.employee_code }],
        monthBounds.start,
        monthBounds.end
      ).then((rows) => rows[0]),
      buildActivityDays(
        {
          id: selected.id,
          fullName: selected.full_name,
          employeeCode: selected.employee_code,
        },
        30
      ),
    ]);
    const first = selected.full_name.split(" ")[0] ?? selected.full_name;

    return (
      <>
        <StaffDashboard
          compact
          readOnly
          greeting={greetingForNow()}
          firstName={first}
          roleLabel={selected.employee_code}
          subtitle={todayLabel}
          sessionState={sessionState}
          commonData={commonData}
          sessionTitle={`${selected.full_name}'s session`}
          sessionHint="Same view the employee sees · view only"
          toolbar={
            <div className="flex items-center gap-2 sm:w-auto">
              {sessionState.isClockedIn ? (
                <AdminLogoutButton employeeId={selected.id} employeeName={selected.full_name} />
              ) : null}
              <div className="sm:w-64">
                <EmployeeWatchSelect employees={employees} employeeId={selected.id} />
              </div>
            </div>
          }
          activity={
            <MyActivityLog
              days={activityDays}
              embedded
              title={`${first}'s activity`}
              subtitle="Last 30 days · view only"
            />
          }
        />
        {pendingMeetings.length > 0 ? (
          <div className="border-x border-b bg-card px-4 py-3">
            <MeetingRequests requests={pendingMeetings} />
          </div>
        ) : null}
        {calendarRow ? (
          <div className="pt-4 pb-6">
            <MonthCalendar
              title={`${formatMonthLabel(monthKey)} — ${calendarRow.employee.full_name}`}
              start={monthBounds.start}
              end={monthBounds.end}
              days={calendarRow.days}
              trackingStart={calendarRow.trackingStart}
              prevHref={`/admin/productivity?view=monthly&employee=${calendarRow.employee.id}&month=${shiftMonth(monthKey, -1)}`}
              nextHref={`/admin/productivity?view=monthly&employee=${calendarRow.employee.id}&month=${shiftMonth(monthKey, 1)}`}
            />
          </div>
        ) : null}
      </>
    );
  }

  const reportRows = teamReport;

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
    <>
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
                <p className="text-sm font-semibold">Today&apos;s report</p>
                <p className="text-xs text-white/70">All employees · pick someone to open their dashboard</p>
              </div>
              <div className="sm:w-64">
                <EmployeeWatchSelect employees={employees} employeeId={null} />
              </div>
            </div>
            <MeetingRequests requests={pendingMeetings} />
            <TeamTodayReport rows={reportRows} attendanceDate={todayIso()} />
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
              hint={`${attendancePct}% attendance${stats.lateEmployees ? ` · ${stats.lateEmployees} late` : ""}`}
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
    </>
  );
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
