import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarOff,
  CheckCircle2,
  MinusCircle,
  TrendingUp,
} from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EmployeeProductivityOverview } from "@/components/dashboard/employee-productivity-overview";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatBreakDuration,
  formatDuration,
  formatExcess,
  formatIsoDate,
  formatMonthLabel,
  todayIso,
  weekdayShortIst,
} from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { emptyExcess, PRODUCTIVE_HOURS_LABEL, PRODUCTIVE_SECONDS, TRACKING_START_DATE } from "@/lib/shift";
import { ExcessSheetCell } from "@/components/attendance/sheet-cells";
import { monthStartEnd } from "@/lib/attendance-period";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { parseProductivityQuery, workingDatesInRange, type ProductivityQuery } from "@/lib/productivity-period";
import { getProductivityReport, type ProductivityRow } from "@/lib/queries/productivity-report";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { ProductivityFilters } from "./productivity-filters";
import {
  BalancePill,
  DayStatusPill,
  PeriodEndCell,
  Pill,
  TargetBar,
} from "./productivity-ui";

const BASE_PATH = "/admin/productivity";
const frozenClassName = "sm:sticky sm:left-0";

export default async function ProductivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const today = todayIso();

  const watchable = seesAll ? await listWatchableEmployees() : [];
  const query = parseProductivityQuery(params, seesAll ? null : ctx.employeeId);
  if (seesAll && query.employeeId && !watchable.some((employee) => employee.id === query.employeeId)) {
    query.employeeId = null;
  }

  let people: { id: string; full_name: string; employee_code: string }[];
  if (seesAll) {
    people = query.employeeId
      ? watchable.filter((employee) => employee.id === query.employeeId)
      : watchable;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, employee_code")
      .eq("id", ctx.employeeId)
      .maybeSingle();
    people = data ? [data] : [];
  }

  const rows = (await getProductivityReport(people, query.start, query.end)).sort(
    (a, b) => b.productiveSeconds - a.productiveSeconds
  );
  const monthKey = query.view === "monthly" ? query.month : query.date.slice(0, 7);
  const monthBounds = monthStartEnd(monthKey);
  const calendarSource =
    people.length === 1
      ? query.view === "monthly"
        ? rows[0]
        : (await getProductivityReport(people, monthBounds.start, monthBounds.end))[0]
      : null;
  const isDaily = query.view === "daily";
  const workingDays = workingDatesInRange(query.start, query.end);
  const periodName = query.view === "monthly" ? "Month" : query.view === "weekly" ? "Week" : "Period";
  // Names open one employee from the team list. Once one is open the page is already theirs.
  const hrefFor =
    seesAll && !query.employeeId ? (employeeId: string) => productivityHref(query, employeeId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {seesAll && query.employeeId ? (
        <div className="-mb-2">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
            <Link href={productivityHref(query, null)}>
              <ArrowLeft className="size-4" />
              All employees
            </Link>
          </Button>
        </div>
      ) : null}
      <ProductivityHero
        label={query.label}
        productiveSeconds={rows.reduce((sum, row) => sum + row.productiveSeconds, 0)}
        targetSeconds={rows.reduce(
          (sum, row) =>
            sum +
            (isDaily
              ? row.days[0] && row.days[0].status !== "off" && row.days[0].status !== "upcoming"
                ? row.days[0].targetSeconds
                : 0
              : row.days
                  .filter((day) => day.date <= today && day.status !== "off" && day.status !== "upcoming")
                  .reduce((daySum, day) => daySum + day.targetSeconds, 0)),
          0
        )}
        who={rows.length === 1 ? rows[0].employee.full_name : `${rows.length} employees`}
      />

      <ProductivityFilters basePath={BASE_PATH} employees={watchable} query={query} today={today} />

      {query.employeeId && people[0] ? (
        <EmployeeProductivityOverview
          employeeId={people[0].id}
          employeeName={seesAll ? people[0].full_name : undefined}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="border bg-card p-4">
          <EmptyState
            icon={TrendingUp}
            title="No employees to show"
            description="Productivity appears once employees start clocking in."
          />
        </div>
      ) : workingDays.length === 0 ? (
        <div className="border bg-card p-4">
          <EmptyState
            icon={CalendarOff}
            title={
              query.end < TRACKING_START_DATE
                ? "Before tracking started"
                : isDaily
                  ? `${weekdayShortIst(query.start)} is a week off`
                  : "No working days in this range"
            }
            description={
              query.end < TRACKING_START_DATE
                ? `Productivity is counted from ${formatIsoDate(TRACKING_START_DATE)} onward. Pick a later date.`
                : "Saturday and Sunday are not counted toward productive hours. Pick a weekday or another range."
            }
          />
        </div>
      ) : isDaily ? (
        <DailyView rows={rows} date={query.start} today={today} hrefFor={hrefFor} />
      ) : (
        <PeriodView
          hrefFor={hrefFor}
          rows={rows}
          workingDays={workingDays}
          today={today}
          periodName={periodName}
          end={query.end}
        />
      )}

      {calendarSource ? (
        <MonthCalendar
          title={`${formatMonthLabel(monthKey)} — ${calendarSource.employee.full_name}`}
          start={monthBounds.start}
          end={monthBounds.end}
          days={calendarSource.days}
          trackingStart={calendarSource.trackingStart}
          today={today}
          prevHref={`${BASE_PATH}?view=monthly&employee=${calendarSource.employee.id}&month=${shiftMonth(monthKey, -1)}`}
          nextHref={`${BASE_PATH}?view=monthly&employee=${calendarSource.employee.id}&month=${shiftMonth(monthKey, 1)}`}
        />
      ) : null}
    </div>
  );
}

/** The same view and dates as `query`, for one employee or (with null) the whole team. */
function productivityHref(query: ProductivityQuery, employeeId: string | null) {
  const params = new URLSearchParams({ view: query.view });
  if (employeeId) params.set("employee", employeeId);
  if (query.view === "daily" || query.view === "weekly") params.set("date", query.date);
  if (query.view === "monthly") params.set("month", query.month);
  if (query.view === "custom") {
    params.set("from", query.start);
    params.set("to", query.end);
  }
  return `${BASE_PATH}?${params.toString()}`;
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function DailyView({
  rows,
  date,
  today,
  hrefFor,
}: {
  rows: ProductivityRow[];
  date: string;
  today: string;
  hrefFor?: (employeeId: string) => string;
}) {
  const days = rows.map((row) => ({ row, day: row.days[0] }));
  const counted = days.filter(({ day }) => day && day.status !== "off");
  const productive = counted.reduce((sum, { day }) => sum + day.productiveSeconds, 0);
  const deficit = counted.reduce(
    (sum, { day }) => sum + Math.max(0, day.targetSeconds - day.productiveSeconds),
    0
  );
  const excess = days.reduce((sum, { day }) => sum + (day?.breakExcess.total ?? 0), 0);
  const isToday = date === today;

  return (
    <div className="flex flex-col [&>*+*]:-mt-px">
      <dl className="grid grid-cols-2 border bg-card xl:grid-cols-3">
        <SheetKpi
          label={rows.length === 1 ? "Productive" : "Team productive"}
          value={formatDuration(productive)}
          valueClassName="text-success"
          hint={
            counted.length > 0 && counted.every(({ day }) => day.attendanceStatus === "HALF_DAY")
              ? `Half day target ${formatDuration(counted[0].day.targetSeconds)}`
              : `Target ${PRODUCTIVE_HOURS_LABEL} each`
          }
        />
        <SheetKpi
          label={isToday ? "Still to go" : "Total deficit"}
          value={formatDuration(deficit)}
          valueClassName={deficit > 0 ? "text-destructive" : "text-success"}
          hint={isToday ? "Shift in progress" : formatIsoDate(date)}
        />
        <SheetKpi
          label="Excess break"
          value={excess > 0 ? `+${formatExcess(excess)}` : "0m"}
          valueClassName={excess > 0 ? "text-destructive" : "text-success"}
          hint="Over Tea 15m · Lunch 45m · total 1h 15m"
        />
      </dl>

      <ReportSheet title={isToday ? "Today so far" : formatIsoDate(date)}>
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
              <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
              <TableHead className={sheetHeadClassName}>Break</TableHead>
              <TableHead className={sheetHeadClassName}>Excess break</TableHead>
              <TableHead className={sheetHeadClassName}>Productive hours</TableHead>
              <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Deficit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map(({ row, day }) => (
              <TableRow key={row.employee.id} className={sheetRowClassName}>
                <EmployeeCells employee={row.employee} href={hrefFor?.(row.employee.id)} />
                <TableCell
                  className={cn(sheetCellClassName, (day?.breakExcess.total ?? 0) > 0 && "font-semibold text-destructive")}
                >
                  {formatBreakDuration(day?.breakSeconds ?? 0)}
                </TableCell>
                <ExcessSheetCell excess={day?.breakExcess ?? emptyExcess()} />
                <TableCell className={sheetCellClassName}>
                  <div className="flex items-center gap-3">
                    <span className="flex w-20 shrink-0 items-center gap-1.5 font-semibold">
                      {formatDuration(day?.productiveSeconds ?? 0)}
                      {day?.status === "met" ? <CheckCircle2 className="size-4 text-success" /> : null}
                    </span>
                    <TargetBar seconds={day?.productiveSeconds ?? 0} target={day?.targetSeconds} />
                  </div>
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "border-r-0")}>
                  {day ? (
                    day.status === "met" ? (
                      <Pill tone="success" icon={CheckCircle2}>
                        On target
                      </Pill>
                    ) : (
                      <DayStatusPill
                        status={day.status}
                        productiveSeconds={day.productiveSeconds}
                        targetSeconds={day.targetSeconds}
                        offStatus={day.offStatus}
                      />
                    )
                  ) : date < row.trackingStart ? (
                    <Pill tone="muted" icon={MinusCircle}>
                      Not tracked
                    </Pill>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportSheet>
    </div>
  );
}

function PeriodView({
  rows,
  workingDays,
  today,
  periodName,
  end,
  hrefFor,
}: {
  rows: ProductivityRow[];
  workingDays: string[];
  today: string;
  periodName: string;
  end: string;
  hrefFor?: (employeeId: string) => string;
}) {
  const elapsed = workingDays.filter((date) => date <= today).length;
  const halfDays = rows.reduce(
    (sum, row) =>
      sum + row.days.filter((day) => day.date <= today && day.attendanceStatus === "HALF_DAY").length,
    0
  );
  const productive = rows.reduce((sum, row) => sum + row.productiveSeconds, 0);
  const deficit = rows.reduce((sum, row) => sum + Math.max(0, -row.balanceSeconds), 0);
  const onTrack = rows.filter(
    (row) =>
      row.periodTargetSeconds > 0 &&
      (row.remainingDays === 0
        ? row.productiveSeconds >= row.periodTargetSeconds
        : row.neededPerDaySeconds <= PRODUCTIVE_SECONDS)
  ).length;
  const finished = end < today;

  return (
    <div className="flex flex-col [&>*+*]:-mt-px">
      <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
        <SheetKpi
          label="Working days"
          value={`${elapsed} / ${workingDays.length}`}
          valueClassName="text-info"
          hint="Mon–Fri · Sat & Sun not counted"
          progress={(elapsed / workingDays.length) * 100}
        />
        <SheetKpi
          label={rows.length === 1 ? "Productive" : "Team productive"}
          value={formatDuration(productive)}
          valueClassName="text-success"
          hint={
            halfDays > 0
              ? `${PRODUCTIVE_HOURS_LABEL} per full day · half day is ${formatDuration(Math.floor(PRODUCTIVE_SECONDS / 2))}`
              : `${PRODUCTIVE_HOURS_LABEL} × working day target`
          }
        />
        <SheetKpi
          label="Deficit so far"
          value={formatDuration(deficit)}
          valueClassName={deficit > 0 ? "text-destructive" : "text-success"}
          hint="Finished days only (today not included)"
        />
        <SheetKpi
          label={finished ? `${periodName} result` : `${periodName}-end on track`}
          value={`${onTrack} / ${rows.length}`}
          valueClassName={onTrack === rows.length ? "text-success" : "text-warning"}
          hint={finished ? "On target for the full period" : `Can still reach the ${periodName.toLowerCase()} target`}
          progress={rows.length ? (onTrack / rows.length) * 100 : 0}
        />
      </dl>

      <ReportSheet title={`${periodName} report`}>
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
              <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
              <TableHead className={sheetHeadClassName}>Days on target</TableHead>
              <TableHead className={sheetHeadClassName}>Productive hours</TableHead>
              <TableHead className={sheetHeadClassName}>Break</TableHead>
              <TableHead className={sheetHeadClassName}>Excess break</TableHead>
              <TableHead className={sheetHeadClassName}>Deficit so far</TableHead>
              <TableHead className={cn(sheetHeadClassName, "border-r-0")}>{periodName} end</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.employee.id} className={sheetRowClassName}>
                <EmployeeCells employee={row.employee} href={hrefFor?.(row.employee.id)} />
                <TableCell className={sheetCellClassName}>
                  <span className="font-semibold">
                    {row.daysMet} / {row.countedDays}
                  </span>
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    of {row.workingDays} working day{row.workingDays === 1 ? "" : "s"}
                  </span>
                </TableCell>
                <TableCell className={sheetCellClassName}>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold">{formatDuration(row.productiveSeconds)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        of {formatDuration(row.periodTargetSeconds)}
                      </span>
                      {row.periodTargetSeconds > 0 && row.productiveSeconds >= row.periodTargetSeconds ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : null}
                    </span>
                    <TargetBar seconds={row.productiveSeconds} target={row.periodTargetSeconds} />
                  </div>
                </TableCell>
                <TableCell
                  className={cn(sheetCellClassName, row.breakExcess.total > 0 && "font-semibold text-destructive")}
                >
                  {formatBreakDuration(row.breakSeconds)}
                </TableCell>
                <ExcessSheetCell excess={row.breakExcess} />
                <TableCell className={sheetCellClassName}>
                  <BalancePill
                    seconds={row.balanceSeconds}
                    hasFinishedDays={row.days.some((day) => day.status !== "off" && day.date < today)}
                  />
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "border-r-0")}>
                  <PeriodEndCell
                    productiveSeconds={row.productiveSeconds}
                    periodTargetSeconds={row.periodTargetSeconds}
                    remainingDays={row.remainingDays}
                    neededPerDaySeconds={row.neededPerDaySeconds}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportSheet>
    </div>
  );
}

function ReportSheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border bg-card">
      <div className="border-b bg-muted px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="[&>[data-slot=table-container]]:max-h-[75svh]">{children}</div>
    </section>
  );
}

function ProductivityHero({
  label,
  productiveSeconds,
  targetSeconds,
  who,
}: {
  label: string;
  productiveSeconds: number;
  targetSeconds: number;
  who: string;
}) {
  const gap = targetSeconds - productiveSeconds;
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-ink-border bg-ink px-4 py-3 text-white">
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.14em] text-white/70 uppercase">
          Productivity · {label}
        </p>
        <h2 className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tracking-tight tabular-nums">
          {formatDuration(productiveSeconds)}
          <span className="text-sm font-medium text-white/70">
            of {formatDuration(targetSeconds)} target
          </span>
        </h2>
        <p className="mt-0.5 text-[13px] text-white/80">
          {who} ·{" "}
          {targetSeconds === 0
            ? "no working days counted yet"
            : gap > 0
              ? `${formatDuration(gap)} behind target so far`
              : "target reached"}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="dash-chip">Daily target {PRODUCTIVE_HOURS_LABEL}</span>
        <span className="dash-chip">Breaks excluded · meetings count</span>
        <span className="dash-chip">Mon–Fri · Sat & Sun off</span>
      </div>
    </section>
  );
}

function EmployeeCells({
  employee,
  href,
}: {
  employee: { full_name: string; employee_code: string };
  href?: string;
}) {
  return (
    <>
      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit font-semibold")}>
        {href ? (
          <Link
            href={href}
            title={`Open ${employee.full_name}'s productivity`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {employee.full_name}
          </Link>
        ) : (
          employee.full_name
        )}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
        {employee.employee_code}
      </TableCell>
    </>
  );
}
