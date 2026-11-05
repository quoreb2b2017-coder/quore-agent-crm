import { NextResponse } from "next/server";
import { buildActivityWorkbook } from "@/lib/activity-excel";
import { parseActivityPeriod } from "@/lib/activity-period";
import { summarizeActivity } from "@/lib/activity-summary";
import { isUuid } from "@/lib/attendance-period";
import { formatDuration, formatExcess, formatIsoDate, formatTimeInZone } from "@/lib/format";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { getShiftActivity, resolveActivityRange } from "@/lib/queries/shift-activity";
import { shiftDayLines, shiftShortSummary } from "@/lib/shift-completion";
import { getWorkSettings } from "@/lib/work-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    return NextResponse.json({ error: "Super Admin or HR only" }, { status: 403 });
  }

  const url = new URL(request.url);
  // The employee page sends a view; the team page sends a mode.
  const range = url.searchParams.has("view")
    ? parseActivityPeriod({
        view: url.searchParams.get("view"),
        date: url.searchParams.get("date"),
        month: url.searchParams.get("month"),
        days: url.searchParams.get("days"),
      })
    : resolveActivityRange(
        url.searchParams.get("mode") ?? undefined,
        url.searchParams.get("days") ?? undefined,
        url.searchParams.get("month") ?? undefined,
        url.searchParams.get("date")
      );
  const requested = url.searchParams.get("employee") ?? "";
  const employeeId = isUuid(requested) ? requested : null;
  const people = await listWatchableEmployees();
  const picked = employeeId ? people.filter((person) => person.id === employeeId) : people;
  const [events, productivity] = await Promise.all([
    getShiftActivity(
      picked.map((person) => ({
        id: person.id,
        fullName: person.full_name,
        employeeCode: person.employee_code,
      })),
      range.start,
      range.end
    ),
    getProductivityReport(picked, range.start, range.end),
  ]);
  const zone = getWorkSettings().timeZone;

  const bytes = await buildActivityWorkbook({
    rangeLabel: `${range.start} to ${range.end}`,
    summary: productivity.map((row) => {
      const activity = summarizeActivity(events.filter((event) => event.employeeId === row.employee.id));
      const shifts = shiftShortSummary(row.days);
      return {
        name: row.employee.full_name,
        employeeCode: row.employee.employee_code,
        status: activity.status.text,
        logins: activity.logins,
        breaks: activity.breaks,
        washrooms: activity.washrooms,
        meetings: activity.meetings,
        complete: shifts.complete,
        short: shifts.shortDays,
        shortTime: formatDuration(shifts.shortSeconds),
      };
    }),
    shifts: productivity.flatMap((row) =>
      shiftDayLines(row.days).map((line) => ({
        name: row.employee.full_name,
        employeeCode: row.employee.employee_code,
        date: formatIsoDate(line.date),
        result: line.result,
        worked: line.worked,
        target: line.target,
        short: line.short,
        tone: line.tone,
      }))
    ),
    events: [...events]
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || b.at.localeCompare(a.at))
      .map((event) => ({
        name: event.fullName,
        employeeCode: event.employeeCode,
        date: formatIsoDate(event.shiftDate),
        time: formatTimeInZone(event.at, zone),
        event: event.label,
        detail: `${event.detail ?? ""}${event.excessSeconds ? ` · +${formatExcess(event.excessSeconds)} over` : ""}`,
        over: Boolean(event.excessSeconds),
      })),
  });

  const who = picked.length === 1 ? picked[0].full_name.replace(/[^\w-]+/g, "-") : "all";
  const filename = `activity-${who}-${range.start}-to-${range.end}.xlsx`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
