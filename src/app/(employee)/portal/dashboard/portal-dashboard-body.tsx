import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { getEmployeeDashboardBundle } from "@/lib/queries/employee-status";
import { getCampaignsDashboardData } from "@/lib/queries/employee-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { StaffDashboard } from "@/components/dashboards/staff-dashboard";
import { MyActivityLog } from "@/components/activity/my-activity-log";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { monthStartEnd } from "@/lib/attendance-period";
import { formatMonthLabel, greetingForNow, INDIA_TIME_ZONE, todayIso } from "@/lib/format";
import { buildActivityDays } from "@/lib/queries/shift-activity";

export async function PortalDashboardBody() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const monthKey = todayIso().slice(0, 7);
  const bounds = monthStartEnd(monthKey);
  const person = { id: ctx.employeeId, fullName: ctx.fullName, employeeCode: ctx.employeeCode };
  const [{ sessionState, commonData }, calendarRow, activityDays] = await Promise.all([
    getEmployeeDashboardBundle(ctx.employeeId),
    getProductivityReport(
      [{ id: ctx.employeeId, full_name: ctx.fullName, employee_code: ctx.employeeCode }],
      bounds.start,
      bounds.end
    ).then((rows) => rows[0]),
    buildActivityDays(person, 30),
  ]);

  const marketingData =
    ctx.roleKey === "EMAIL_MARKETING" ? await getCampaignsDashboardData(ctx.employeeId) : null;

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });

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
      marketingData={marketingData}
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
          prevHref={`/portal/productivity?month=${shiftMonth(monthKey, -1)}`}
          nextHref={`/portal/productivity?month=${shiftMonth(monthKey, 1)}`}
        />
      </div>
    ) : null}
    </>
  );
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
