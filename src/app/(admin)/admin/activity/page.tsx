import Link from "next/link";
import { Radio } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { activityPeriodParams } from "@/lib/activity-period";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countActivity, summarizeActivity, type ActivityStatus } from "@/lib/activity-summary";
import { isUuid } from "@/lib/attendance-period";
import { formatDuration } from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { getShiftActivity, resolveActivityRange } from "@/lib/queries/shift-activity";
import { shiftShortSummary } from "@/lib/shift-completion";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { ActivityFilters } from "./activity-filters";

const frozenClassName = "sm:sticky sm:left-0";

const statusClass: Record<ActivityStatus["tone"], string> = {
  login: "bg-success/10 text-success",
  logout: "bg-muted text-muted-foreground",
  break: "bg-warning/15 text-warning",
  washroom: "bg-info/10 text-info",
  meeting: "bg-primary/10 text-primary",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { seesAll } = await requireViewer();
  if (!seesAll) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Activity" description="Shift activity is visible to Super Admin." />
        <div className="border bg-card p-4">
          <EmptyState
            icon={Radio}
            title="Admin only"
            description="Shift activity is visible to Super Admin."
          />
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const range = resolveActivityRange(one(params.mode), one(params.days), one(params.month), one(params.date));
  const requested = one(params.employee);
  const employeeId = requested && isUuid(requested) ? requested : null;
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
  const totals = countActivity(events);
  const who = picked.length === 1 ? picked[0].full_name : "All employees";
  // The employee page opens on the same period this page is showing.
  const detailParams = activityPeriodParams({
    view: range.mode === "month" ? "monthly" : range.mode === "week" ? "weekly" : "days",
    date: range.date,
    month: range.month,
    dayCount: range.days,
  }).toString();

  const rows = productivity
    .map((row) => {
      const personEvents = events.filter((event) => event.employeeId === row.employee.id);
      return {
        employee: row.employee,
        activity: summarizeActivity(personEvents),
        shifts: shiftShortSummary(row.days),
      };
    })
    .sort(
      (a, b) =>
        Number(b.activity.status.live) - Number(a.activity.status.live) ||
        a.employee.full_name.localeCompare(b.employee.full_name)
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Activity"
        description={`${range.label} · ${who} · ${range.start} to ${range.end}`}
      />

      <div className="flex flex-col [&>*+*]:-mt-px">
        <ActivityFilters
          mode={range.mode}
          days={range.days}
          month={range.month}
          date={range.date}
          employeeId={employeeId}
          employees={people}
        />

        <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
          <SheetKpi label="Logins" value={totals.logins} valueClassName="text-success" />
          <SheetKpi label="Breaks" value={totals.breaks} valueClassName="text-warning" />
          <SheetKpi label="Washroom visits" value={totals.washrooms} valueClassName="text-info" />
          <SheetKpi label="Meetings" value={totals.meetings} />
        </dl>

        <section className="border bg-card">
          <div className="border-b bg-muted px-3 py-2">
            <h2 className="text-sm font-semibold">Employees</h2>
            <p className="text-xs text-muted-foreground">Click a name to open that person&apos;s full activity page</p>
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Radio}
                title="No employees in this range"
                description="Pick more days, another month, or a different employee."
              />
            </div>
          ) : (
            <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-22rem)] [&>[data-slot=table-container]]:min-h-64">
              <Table className="border-separate border-spacing-0">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
                    <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                    <TableHead className={sheetHeadClassName}>Current status</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Logins</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Breaks</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Washroom</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Meetings</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Days complete</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "text-right")}>Days short</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "border-r-0 text-right")}>Total short</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ employee, activity, shifts }) => (
                    <TableRow key={employee.id} className={sheetRowClassName}>
                      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit")}>
                        <Link
                          href={`/admin/activity/${employee.id}?${detailParams}`}
                          title={`Open ${employee.full_name}'s activity`}
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {employee.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                        {employee.employee_code}
                      </TableCell>
                      <TableCell className={sheetCellClassName}>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold",
                            statusClass[activity.status.tone]
                          )}
                        >
                          {activity.status.live ? <span className="size-1.5 rounded-full bg-current" /> : null}
                          {activity.status.text}
                        </span>
                      </TableCell>
                      <TableCell className={cn(sheetCellClassName, "text-right")}>{activity.logins}</TableCell>
                      <TableCell className={cn(sheetCellClassName, "text-right")}>{activity.breaks}</TableCell>
                      <TableCell className={cn(sheetCellClassName, "text-right")}>{activity.washrooms}</TableCell>
                      <TableCell className={cn(sheetCellClassName, "text-right")}>{activity.meetings}</TableCell>
                      <TableCell className={cn(sheetCellClassName, "text-right font-semibold text-success")}>
                        {shifts.complete}
                      </TableCell>
                      <TableCell
                        className={cn(
                          sheetCellClassName,
                          "text-right font-semibold",
                          shifts.shortDays > 0 ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {shifts.shortDays}
                      </TableCell>
                      <TableCell
                        className={cn(
                          sheetCellClassName,
                          "border-r-0 text-right",
                          shifts.shortDays > 0 ? "font-semibold text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {shifts.shortDays > 0 ? formatDuration(shifts.shortSeconds) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
