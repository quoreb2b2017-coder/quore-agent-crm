import {
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  Hourglass,
  MinusCircle,
  PauseCircle,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EmployeeProductivityOverview } from "@/components/dashboard/employee-productivity-overview";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  eachDateInclusive,
  formatDuration,
  formatExcess,
  formatIsoDate,
  initials,
  isWeekendIso,
  todayIso,
  weekdayIndexIst,
  weekdayShortIst,
} from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { emptyExcess, PRODUCTIVE_HOURS_LABEL, PRODUCTIVE_SECONDS, TRACKING_START_DATE } from "@/lib/shift";
import { BreakExcessCell } from "@/components/attendance/break-excess";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { parseProductivityQuery, workingDatesInRange } from "@/lib/productivity-period";
import { getProductivityReport, type ProductivityRow } from "@/lib/queries/productivity-report";
import { ProductivityFilters } from "./productivity-filters";
import {
  BalancePill,
  DayHeatCell,
  DayStatusPill,
  PeriodEndCell,
  Pill,
  StatusLegend,
  TargetBar,
} from "./productivity-ui";

const BASE_PATH = "/admin/productivity";

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
  const isDaily = query.view === "daily";
  const workingDays = workingDatesInRange(query.start, query.end);
  const periodName = query.view === "monthly" ? "Month" : query.view === "weekly" ? "Week" : "Period";

  return (
    <div className="flex flex-col gap-6">
      <ProductivityHero
        label={query.label}
        productiveSeconds={rows.reduce((sum, row) => sum + row.productiveSeconds, 0)}
        targetSeconds={rows.reduce(
          (sum, row) =>
            sum +
            (isDaily
              ? row.days[0] && row.days[0].status !== "off" && row.days[0].status !== "upcoming"
                ? PRODUCTIVE_SECONDS
                : 0
              : row.countedDays * PRODUCTIVE_SECONDS),
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
        <Card>
          <CardContent>
            <EmptyState
              icon={TrendingUp}
              title="No employees to show"
              description="Productivity appears once employees start clocking in."
            />
          </CardContent>
        </Card>
      ) : workingDays.length === 0 ? (
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : isDaily ? (
        <DailyView rows={rows} date={query.start} today={today} />
      ) : (
        <PeriodView
          rows={rows}
          workingDays={workingDays}
          today={today}
          periodName={periodName}
          start={query.start}
          end={query.end}
          showBreakdown={rows.length === 1}
        />
      )}
    </div>
  );
}

function DailyView({ rows, date, today }: { rows: ProductivityRow[]; date: string; today: string }) {
  const days = rows.map((row) => ({ row, day: row.days[0] }));
  const counted = days.filter(({ day }) => day && day.status !== "off");
  const productive = counted.reduce((sum, { day }) => sum + day.productiveSeconds, 0);
  const deficit = counted.reduce(
    (sum, { day }) => sum + Math.max(0, PRODUCTIVE_SECONDS - day.productiveSeconds),
    0
  );
  const excess = days.reduce((sum, { day }) => sum + (day?.breakExcess.total ?? 0), 0);
  const isToday = date === today;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={rows.length === 1 ? "Productive" : "Team productive"}
          value={formatDuration(productive)}
          icon={Timer}
          tone="success"
          hint={`Target ${PRODUCTIVE_HOURS_LABEL} each`}
        />
        <StatCard
          label={isToday ? "Still to go" : "Total deficit"}
          value={formatDuration(deficit)}
          icon={Hourglass}
          tone={deficit > 0 ? "destructive" : "success"}
          hint={isToday ? "Shift in progress" : formatIsoDate(date)}
        />
        <StatCard
          label="Excess break"
          value={excess > 0 ? `+${formatExcess(excess)}` : "0m"}
          icon={PauseCircle}
          tone={excess > 0 ? "destructive" : "success"}
          hint="Over Tea 15m · Lunch 45m · total 1h 15m"
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <ReportHeader title={isToday ? "Today so far" : formatIsoDate(date)} />
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-5">Employee</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Excess break</TableHead>
              <TableHead>Productive hours</TableHead>
              <TableHead className="pr-5">Deficit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map(({ row, day }) => (
              <TableRow key={row.employee.id} className="transition-colors">
                <TableCell className="pl-5">
                  <EmployeeCell employee={row.employee} />
                </TableCell>
                <TableCell className="tabular-nums">{formatDuration(day?.breakSeconds ?? 0)}</TableCell>
                <TableCell>
                  <BreakExcessCell excess={day?.breakExcess ?? emptyExcess()} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                      {formatDuration(day?.productiveSeconds ?? 0)}
                      {day?.status === "met" ? <CheckCircle2 className="size-4 text-success" /> : null}
                    </span>
                    <TargetBar seconds={day?.productiveSeconds ?? 0} />
                  </div>
                </TableCell>
                <TableCell className="pr-5">
                  {day ? (
                    <DayStatusPill
                      status={day.status}
                      productiveSeconds={day.productiveSeconds}
                      offStatus={day.offStatus}
                    />
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
      </Card>
    </>
  );
}

function PeriodView({
  rows,
  workingDays,
  today,
  periodName,
  start,
  end,
  showBreakdown,
}: {
  rows: ProductivityRow[];
  workingDays: string[];
  today: string;
  periodName: string;
  start: string;
  end: string;
  showBreakdown: boolean;
}) {
  const elapsed = workingDays.filter((date) => date <= today).length;
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
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Working days"
          value={`${elapsed} / ${workingDays.length}`}
          icon={CalendarCheck}
          tone="info"
          hint="Mon–Fri · Sat & Sun not counted"
          progress={(elapsed / workingDays.length) * 100}
        />
        <StatCard
          label={rows.length === 1 ? "Productive" : "Team productive"}
          value={formatDuration(productive)}
          icon={Timer}
          tone="success"
          hint={`${PRODUCTIVE_HOURS_LABEL} × working day target`}
        />
        <StatCard
          label="Deficit so far"
          value={formatDuration(deficit)}
          icon={Hourglass}
          tone={deficit > 0 ? "destructive" : "success"}
          hint="Finished days only (today not included)"
        />
        <StatCard
          label={finished ? `${periodName} result` : `${periodName}-end on track`}
          value={`${onTrack} / ${rows.length}`}
          icon={Target}
          tone={onTrack === rows.length ? "success" : "warning"}
          hint={finished ? "Met the full target" : `Can still reach the ${periodName.toLowerCase()} target`}
          progress={rows.length ? (onTrack / rows.length) * 100 : 0}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <ReportHeader title={`${periodName} report`} />
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-5">Employee</TableHead>
              <TableHead>Days met</TableHead>
              <TableHead>Productive hours</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Excess break</TableHead>
              <TableHead>Deficit so far</TableHead>
              <TableHead className="pr-5">{periodName} end</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.employee.id} className="transition-colors">
                <TableCell className="pl-5">
                  <EmployeeCell employee={row.employee} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold tabular-nums">
                      {row.daysMet} / {row.countedDays}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      of {row.workingDays} working day{row.workingDays === 1 ? "" : "s"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                      {formatDuration(row.productiveSeconds)}
                      {row.periodTargetSeconds > 0 && row.productiveSeconds >= row.periodTargetSeconds ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : null}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      of {formatDuration(row.periodTargetSeconds)}
                    </span>
                    <TargetBar seconds={row.productiveSeconds} target={row.periodTargetSeconds} />
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{formatDuration(row.breakSeconds)}</TableCell>
                <TableCell>
                  <BreakExcessCell excess={row.breakExcess} />
                </TableCell>
                <TableCell>
                  <BalancePill
                    seconds={row.balanceSeconds}
                    hasFinishedDays={row.days.some((day) => day.status !== "off" && day.date < today)}
                  />
                </TableCell>
                <TableCell className="pr-5">
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
      </Card>

      {showBreakdown ? <DayBreakdown row={rows[0]} start={start} end={end} /> : null}
    </>
  );
}

function DayBreakdown({ row, start, end }: { row: ProductivityRow; start: string; end: string }) {
  const byDate = new Map(row.days.map((day) => [day.date, day]));
  const dates = eachDateInclusive(start, end);
  const leadingBlanks = (weekdayIndexIst(start) + 6) % 7;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ReportHeader title={`Day by day — ${row.employee.full_name}`} />
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-7 gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {label}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {dates.map((date) => {
            const day = byDate.get(date);
            const weekend = isWeekendIso(date);
            const untracked = !weekend && date < row.trackingStart;
            return (
              <DayHeatCell
                key={date}
                dayOfMonth={Number(date.slice(8, 10))}
                weekdayLabel={weekdayShortIst(date)}
                status={weekend || untracked ? "weekend" : (day?.status ?? "upcoming")}
                productiveSeconds={day?.productiveSeconds ?? 0}
                offLabel={
                  weekend
                    ? "Week off"
                    : untracked
                      ? "Not tracked"
                      : day?.offStatus === "HOLIDAY"
                      ? "Holiday"
                      : day?.offStatus
                        ? "On leave"
                        : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function ReportHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <StatusLegend />
    </div>
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
    <section className="dash-hero relative overflow-hidden rounded-3xl p-6 text-white sm:p-7">
      <div className="dash-hero-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-white/70 uppercase">
            Productivity · {label}
          </p>
          <h2 className="mt-2 flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
            {formatDuration(productiveSeconds)}
            <span className="text-base font-medium text-white/70 sm:text-lg">
              of {formatDuration(targetSeconds)} target
            </span>
          </h2>
          <p className="mt-1.5 text-sm text-white/80">
            {who} ·{" "}
            {targetSeconds === 0
              ? "no working days counted yet"
              : gap > 0
                ? `${formatDuration(gap)} behind target so far`
                : "target reached"}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="dash-chip">Daily target {PRODUCTIVE_HOURS_LABEL}</span>
            <span className="dash-chip">Breaks excluded · meetings count</span>
            <span className="dash-chip">Mon–Fri · Sat & Sun off</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmployeeCell({ employee }: { employee: { full_name: string; employee_code: string } }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials(employee.full_name)}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{employee.full_name}</span>
        <span className="text-xs text-muted-foreground">{employee.employee_code}</span>
      </div>
    </div>
  );
}
