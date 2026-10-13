import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { EmployeeProductivityOverview } from "@/components/dashboard/employee-productivity-overview";
import { monthStartEnd } from "@/lib/attendance-period";
import { formatMonthLabel, shiftWindowLabel, todayIso } from "@/lib/format";
import { PRODUCTIVE_HOURS_LABEL } from "@/lib/shift";
import { getProductivityReport } from "@/lib/queries/productivity-report";

export default async function MyProductivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const params = await searchParams;
  const requested = Array.isArray(params.month) ? params.month[0] : params.month;
  const monthKey = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : todayIso().slice(0, 7);
  const bounds = monthStartEnd(monthKey);
  const row = (
    await getProductivityReport(
      [{ id: ctx.employeeId, full_name: ctx.fullName, employee_code: ctx.employeeCode }],
      bounds.start,
      bounds.end
    )
  )[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productivity"
        description={`${shiftWindowLabel()} · target ${PRODUCTIVE_HOURS_LABEL} productive of 9 hrs`}
      />
      <EmployeeProductivityOverview employeeId={ctx.employeeId} />
      {row ? (
        <MonthCalendar
          title={`${formatMonthLabel(monthKey)} — ${ctx.fullName}`}
          start={bounds.start}
          end={bounds.end}
          days={row.days}
          trackingStart={row.trackingStart}
          prevHref={`/portal/productivity?month=${shiftMonth(monthKey, -1)}`}
          nextHref={`/portal/productivity?month=${shiftMonth(monthKey, 1)}`}
        />
      ) : null}
    </div>
  );
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
