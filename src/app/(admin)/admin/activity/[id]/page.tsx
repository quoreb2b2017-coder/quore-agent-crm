import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activityPeriodParams, parseActivityPeriod } from "@/lib/activity-period";
import { countActivity } from "@/lib/activity-summary";
import { formatIsoDate, initials, todayIso } from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { buildActivityDays } from "@/lib/queries/shift-activity";
import { shiftDayLines, shiftShortSummary, type ShiftDayTone } from "@/lib/shift-completion";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { ActivityLogTable } from "./activity-log-table";
import { ActivityPeriodFilters } from "./activity-period-filters";

const toneClass: Record<ShiftDayTone, string> = {
  complete: "bg-success/10 font-semibold text-success",
  short: "bg-destructive/10 font-semibold text-destructive",
  progress: "bg-warning/10 font-semibold text-warning",
  off: "text-muted-foreground",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployeeActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { seesAll } = await requireViewer();
  if (!seesAll) redirect("/admin/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const people = await listWatchableEmployees();
  const person = people.find((employee) => employee.id === id);
  if (!person) notFound();

  const period = parseActivityPeriod({
    view: one(query.view),
    date: one(query.date),
    month: one(query.month),
    days: one(query.days),
  });
  const [days, report] = await Promise.all([
    buildActivityDays(
      { id: person.id, fullName: person.full_name, employeeCode: person.employee_code },
      period.dayTotal,
      period.end
    ),
    getProductivityReport([person], period.start, period.end),
  ]);

  const totals = countActivity(days.flatMap((day) => day.events));
  const shifts = shiftShortSummary(report[0]?.days ?? []);
  const lines = shiftDayLines(report[0]?.days ?? []).sort((a, b) => b.date.localeCompare(a.date));
  const lineByDate = new Map(lines.map((line) => [line.date, line]));
  const daysWithEvents = days
    .filter((day) => day.events.length > 0)
    .map((day) => {
      const line = lineByDate.get(day.date);
      return {
      date: day.date,
      label: day.label,
      shiftNote: line ? (line.tone === "off" ? line.result : `${line.result} · Worked ${line.worked} of ${line.target}`) : null,
      // Send the browser only what the table shows.
      events: day.events.map(({ id: eventId, at, label, detail, tone, excessSeconds, liveLimitSeconds }) => ({
        id: eventId,
        at,
        label,
        detail,
        tone,
        excessSeconds,
        liveLimitSeconds,
      })),
      };
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/admin/activity">
            <ArrowLeft className="size-4" />
            Activity
          </Link>
        </Button>
      </div>

      <section className="flex flex-wrap items-center gap-3 border bg-card px-4 py-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint-soft text-sm font-bold text-primary">
          {initials(person.full_name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{person.full_name}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            <span className="font-mono text-xs font-semibold">{person.employee_code}</span> · {period.label} ·{" "}
            {period.start === period.end ? period.start : `${period.start} to ${period.end}`}
          </p>
        </div>
      </section>

      <div className="flex flex-col [&>*+*]:-mt-px">
        <ActivityPeriodFilters
          key={activityPeriodParams(period).toString()}
          employeeId={person.id}
          view={period.view}
          date={period.date}
          month={period.month}
          dayCount={period.dayCount}
          today={todayIso()}
        />
        <dl className="grid grid-cols-2 border bg-card sm:grid-cols-3 xl:grid-cols-6">
          <SheetKpi label="Logins" value={totals.logins} valueClassName="text-success" />
          <SheetKpi label="Breaks" value={totals.breaks} valueClassName="text-warning" />
          <SheetKpi label="Washroom" value={totals.washrooms} valueClassName="text-info" />
          <SheetKpi label="Meetings" value={totals.meetings} />
          <SheetKpi label="Days complete" value={shifts.complete} valueClassName="text-success" />
          <SheetKpi
            label="Days short"
            value={shifts.shortDays}
            valueClassName={shifts.shortDays > 0 ? "text-destructive" : undefined}
          />
        </dl>
      </div>

      <section className="border bg-card">
        <div className="border-b bg-muted px-3 py-2">
          <h2 className="text-sm font-semibold">Shift completion</h2>
          <p className="text-xs text-muted-foreground">Click a date to see only that day</p>
        </div>
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No shift days in this period.</p>
        ) : (
          <div className="[&>[data-slot=table-container]]:max-h-[60svh]">
            <Table className="border-separate border-spacing-0">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={sheetHeadClassName}>Date</TableHead>
                  <TableHead className={sheetHeadClassName}>Shift</TableHead>
                  <TableHead className={sheetHeadClassName}>Worked</TableHead>
                  <TableHead className={sheetHeadClassName}>Target</TableHead>
                  <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Short</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.date} className={sheetRowClassName}>
                    <TableCell className={sheetCellClassName}>
                      <Link
                        href={`/admin/activity/${person.id}?view=daily&date=${line.date}`}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {formatIsoDate(line.date)}
                      </Link>
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, toneClass[line.tone])}>{line.result}</TableCell>
                    <TableCell className={sheetCellClassName}>{line.worked}</TableCell>
                    <TableCell className={sheetCellClassName}>{line.target}</TableCell>
                    <TableCell
                      className={cn(
                        sheetCellClassName,
                        "border-r-0 font-medium",
                        line.tone === "short" && "text-destructive",
                        line.tone === "complete" && "text-success"
                      )}
                    >
                      {line.short}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="border bg-card">
        <div className="border-b bg-muted px-3 py-2">
          <h2 className="text-sm font-semibold">Activity log</h2>
          <p className="text-xs text-muted-foreground">Date by date, newest first. Each day runs in time order and ends with its total.</p>
        </div>
        {daysWithEvents.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Radio} title="No activity in this period" description="Pick another day, week or month." />
          </div>
        ) : (
          <ActivityLogTable days={daysWithEvents} />
        )}
      </section>
    </div>
  );
}
