import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
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
  addDaysIso,
  eachDateInclusive,
  formatBreakDuration,
  formatDuration,
  formatExcess,
  formatIsoDate,
  formatMonthLabel,
  formatTime,
  isWeekendIso,
  shiftDateIso,
  shiftWindowLabel,
  todayIso,
} from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import { ensureStaffWeekendOff, weekendOrRecordedStatus } from "@/lib/attendance-weekend";
import {
  breakExcess,
  breakSecondsBySlot,
  creditedProductiveSeconds,
  emptyExcess,
  istLocalToUtc,
  type BreakExcess,
} from "@/lib/shift";
import { formatLeaveComment } from "@/lib/leave";
import { leaveNotesByDay } from "@/lib/queries/leave";
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { AttendanceFilters } from "@/components/attendance/attendance-filters";
import { ExcessSheetCell, TargetSheetCell, targetResult } from "@/components/attendance/sheet-cells";
import { AttendanceLeaveMark } from "@/components/leave/leave-reason-tip";
import {
  addAttendanceRow,
  emptyAttendanceCounts,
  monthKeysForYear,
  parseAttendanceQuery,
  type AttendanceCounts,
} from "@/lib/attendance-period";
import { sheetCellClassName, sheetDateRowClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  status: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_active_seconds: number;
  total_break_seconds: number;
  notes: string | null;
  overtime_minutes: number;
};

type EmployeeOption = {
  id: string;
  full_name: string;
  employee_code: string;
};

const ATTENDANCE_COLUMNS =
  "id, employee_id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, notes, overtime_minutes";

const PAGE_SIZE = 1000;
const frozenClassName = "sm:sticky sm:left-0";
const totalCellClassName = "border-b-2 border-b-ink/50 font-bold";

function periodLabel(query: ReturnType<typeof parseAttendanceQuery>) {
  if (query.view === "daily") return formatIsoDate(query.date);
  if (query.view === "weekly") return `${formatIsoDate(query.start)} – ${formatIsoDate(query.end)}`;
  if (query.view === "monthly") return formatMonthLabel(query.month);
  return query.year;
}

function countsFromRows(rows: AttendanceRecord[]): AttendanceCounts {
  const counts = emptyAttendanceCounts();
  for (const row of rows) addAttendanceRow(counts, row);
  return counts;
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const query = parseAttendanceQuery(params, seesAll ? null : ctx.employeeId);
  const search = (Array.isArray(params.q) ? params.q[0] : params.q ?? "").trim();
  const supabase = await createClient();
  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .neq("employment_status", "TERMINATED")
    .order("full_name");
  if (!seesAll) employeesQuery = employeesQuery.eq("id", ctx.employeeId);

  const [adminIds, { data: employeeRows }] = await Promise.all([
    seesAll ? superAdminEmployeeIds(supabase) : [],
    employeesQuery,
  ]);
  const adminSet = new Set(adminIds);
  const skipAdmins = excludeIds(adminIds);
  const employeeId =
    query.employeeId && !adminSet.has(query.employeeId) ? query.employeeId : null;
  const employees = ((employeeRows ?? []) as EmployeeOption[]).filter((employee) => !adminSet.has(employee.id));

  if (employeeId && !employees.some((employee) => employee.id === employeeId)) {
    const { data: extra } = await supabase
      .from("employees")
      .select("id, full_name, employee_code")
      .eq("id", employeeId)
      .maybeSingle();
    if (extra) employees.unshift(extra);
  }
  const selectedEmployee = employeeId
    ? employees.find((employee) => employee.id === employeeId) ?? null
    : null;

  if (query.view === "daily" && isWeekendIso(query.date)) {
    await ensureStaffWeekendOff(
      supabase,
      query.date,
      (employeeId ? employees.filter((person) => person.id === employeeId) : employees).map(
        (person) => person.id
      )
    );
  }

  let attendanceQuery = supabase
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .gte("attendance_date", query.start)
    .lte("attendance_date", query.end)
    .order("attendance_date", { ascending: query.view !== "daily" })
    .limit(20000);
  if (employeeId) attendanceQuery = attendanceQuery.eq("employee_id", employeeId);
  else if (!seesAll) attendanceQuery = attendanceQuery.eq("employee_id", ctx.employeeId);
  else if (skipAdmins) attendanceQuery = attendanceQuery.not("employee_id", "in", skipAdmins);

  // Week and month behave alike: a team summary, or one person's days.
  const showsDaysOfOne = query.view === "weekly" || query.view === "monthly";

  // Only the views with one row per day show excess break.
  async function loadExcessByKey() {
    const excess = new Map<string, BreakExcess>();
    if (query.view !== "daily" && !(showsDaysOfOne && employeeId)) return excess;
    const grouped = new Map<
      string,
      { break_type: string; started_at: string; ended_at: string | null; duration_seconds: number | null }[]
    >();
    for (let from = 0; ; from += PAGE_SIZE) {
      let breaksQuery = supabase
        .from("breaks")
        .select("employee_id, break_type, started_at, ended_at, duration_seconds")
        .gte("started_at", istLocalToUtc(query.start, 0, 0).toISOString())
        .lt("started_at", istLocalToUtc(addDaysIso(query.end, 2), 0, 0).toISOString());
      if (employeeId) breaksQuery = breaksQuery.eq("employee_id", employeeId);
      else if (!seesAll) breaksQuery = breaksQuery.eq("employee_id", ctx.employeeId);
      else if (skipAdmins) breaksQuery = breaksQuery.not("employee_id", "in", skipAdmins);
      const { data } = await breaksQuery.order("started_at").range(from, from + PAGE_SIZE - 1);
      for (const row of data ?? []) {
        const key = `${row.employee_id}|${shiftDateIso(new Date(row.started_at))}`;
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
    for (const [key, rows] of grouped) excess.set(key, breakExcess(breakSecondsBySlot(rows)));
    return excess;
  }

  const [{ data: attendanceRows }, leaveNotes, excessByKey] = await Promise.all([
    attendanceQuery,
    leaveNotesByDay(
      employees.map((employee) => employee.id),
      query.start,
      query.end
    ),
    loadExcessByKey(),
  ]);
  const records = (attendanceRows ?? []) as AttendanceRecord[];
  const today = todayIso();

  function leaveDetail(personId: string, date: string, notes: string | null | undefined) {
    const request = leaveNotes.get(`${personId}|${date}`);
    if (request?.reason) return { subject: request.subject, reason: request.reason };
    return formatLeaveComment(notes);
  }

  const scopedEmployees = employeeId
    ? employees.filter((employee) => employee.id === employeeId)
    : employees;
  const needle = search.toLowerCase();
  const visibleEmployees =
    employeeId || !needle
      ? scopedEmployees
      : scopedEmployees.filter(
          (employee) =>
            employee.full_name.toLowerCase().includes(needle) ||
            employee.employee_code.toLowerCase().includes(needle)
        );
  const visibleIds = new Set(visibleEmployees.map((employee) => employee.id));

  const titlePerson = selectedEmployee?.full_name ?? (seesAll ? "All employees" : ctx.fullName);
  const description = `${shiftWindowLabel()} · ${titlePerson} · ${periodLabel(query)}`;

  const dailyRoster =
    query.view === "daily"
      ? visibleEmployees.map((employee) => ({
          employee,
          attendance: records.find((row) => row.employee_id === employee.id),
        }))
      : [];

  const dailyCounts = emptyAttendanceCounts();
  if (query.view === "daily") {
    for (const { attendance } of dailyRoster) {
      const status = weekendOrRecordedStatus(query.date, attendance?.status);
      if (attendance) addAttendanceRow(dailyCounts, { ...attendance, status });
      else if (status === "WEEK_OFF") addAttendanceRow(dailyCounts, {
        status,
        total_active_seconds: 0,
        total_break_seconds: 0,
      });
      else dailyCounts.absent += 1;
    }
  }

  const visibleRecords = records.filter((row) => visibleIds.has(row.employee_id));
  const rangeCounts = query.view === "daily" ? dailyCounts : countsFromRows(visibleRecords);
  const byEmployee = new Map<string, AttendanceCounts>();
  for (const employee of visibleEmployees) {
    byEmployee.set(employee.id, emptyAttendanceCounts());
  }
  for (const row of visibleRecords) {
    const current = byEmployee.get(row.employee_id) ?? emptyAttendanceCounts();
    addAttendanceRow(current, row);
    byEmployee.set(row.employee_id, current);
  }

  const byDate = new Map(records.map((row) => [row.attendance_date, row]));
  const monthDays =
    showsDaysOfOne && employeeId ? eachDateInclusive(query.start, query.end) : [];
  const yearMonths = query.view === "yearly" && employeeId ? monthKeysForYear(query.year) : [];
  const byMonth = new Map<string, AttendanceCounts>();
  if (query.view === "yearly" && employeeId) {
    for (const key of yearMonths) byMonth.set(key, emptyAttendanceCounts());
    for (const row of records) {
      const key = row.attendance_date.slice(0, 7);
      const current = byMonth.get(key) ?? emptyAttendanceCounts();
      addAttendanceRow(current, row);
      byMonth.set(key, current);
    }
  }

  const monthTargets = monthDays.map(
    (day) =>
      dayTarget(day, byDate.get(day), weekendOrRecordedStatus(day, byDate.get(day)?.status, "NO_RECORD"), today)
        .state
  );
  const monthMet = monthTargets.filter((state) => state === "met").length;
  const monthShort = monthTargets.filter((state) => state === "short").length;
  const monthExcess = employeeId
    ? monthDays.reduce((sum, day) => sum + (excessByKey.get(`${employeeId}|${day}`)?.total ?? 0), 0)
    : 0;
  const monthOvertime = monthDays.reduce((sum, day) => sum + (byDate.get(day)?.overtime_minutes ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Attendance" description={description} />

      <div className="flex flex-col [&>*+*]:-mt-px">
        <AttendanceFilters
          canPickEmployee={seesAll}
          employees={employees}
          view={query.view}
          employeeId={employeeId}
          date={query.date}
          month={query.month}
          year={query.year}
          search={search}
        />

        <dl className="grid grid-cols-2 border bg-card sm:grid-cols-5">
          <SummaryCell label="Present" value={rangeCounts.present} tone="text-success" />
          <SummaryCell label="On leave" value={rangeCounts.leave} tone="text-info" />
          <SummaryCell label="Absent" value={rangeCounts.absent} tone="text-destructive" />
          <SummaryCell label="Productive" value={formatDuration(rangeCounts.activeSeconds)} tone="text-success" />
          <SummaryCell label="Breaks" value={formatBreakDuration(rangeCounts.breakSeconds)} />
        </dl>

        {query.view === "daily" ? (
          dailyRoster.length === 0 ? (
            <div className="border bg-card p-4">
              <EmptyState
                icon={CalendarCheck}
                title={search ? "No employees match this search" : "No employees in this view"}
              />
            </div>
          ) : (
            <AttendanceSheetFrame>
              <Table className="border-separate border-spacing-0">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    {employeeId ? null : (
                      <>
                        <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
                        <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                      </>
                    )}
                    <DayMetricHeads seesAll={seesAll} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRoster.map(({ employee, attendance }) => (
                    <TableRow key={employee.id} className={sheetRowClassName}>
                      {employeeId ? null : (
                        <EmployeeCells
                          employee={employee}
                          href={seesAll ? employeeHistoryHref(employee.id, query) : undefined}
                        />
                      )}
                      <DayMetricCells
                        employee={employee}
                        date={query.date}
                        today={today}
                        status={weekendOrRecordedStatus(query.date, attendance?.status)}
                        attendance={attendance}
                        excess={excessByKey.get(`${employee.id}|${query.date}`)}
                        leave={leaveDetail(employee.id, query.date, attendance?.notes)}
                        seesAll={seesAll}
                      />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AttendanceSheetFrame>
          )
        ) : null}

        {showsDaysOfOne && !employeeId ? (
          <AttendanceSheetFrame>
            <TeamSummaryTable
              employees={visibleEmployees}
              byEmployee={byEmployee}
              month={query.view === "monthly" ? query.month : undefined}
              weekDate={query.view === "weekly" ? query.date : undefined}
              seesAll={seesAll}
              emptyTitle={search ? "No employees match this search" : "No employees yet"}
            />
          </AttendanceSheetFrame>
        ) : null}

        {showsDaysOfOne && employeeId ? (
          <AttendanceSheetFrame>
            <Table className="border-separate border-spacing-0">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Date</TableHead>
                  <DayMetricHeads seesAll={seesAll} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthDays.map((day) => {
                  const attendance = byDate.get(day);
                  const employee = selectedEmployee ?? scopedEmployees[0];
                  if (!employee) return null;
                  return (
                    <TableRow key={day} className={sheetRowClassName}>
                      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit font-medium")}>
                        {formatIsoDate(day)}
                      </TableCell>
                      <DayMetricCells
                        employee={employee}
                        date={day}
                        today={today}
                        status={weekendOrRecordedStatus(day, attendance?.status, "NO_RECORD")}
                        attendance={attendance}
                        excess={excessByKey.get(`${employee.id}|${day}`)}
                        leave={leaveDetail(employee.id, day, attendance?.notes)}
                        seesAll={seesAll}
                      />
                    </TableRow>
                  );
                })}
                <TableRow className={sheetDateRowClassName}>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName, frozenClassName, "z-[1] bg-inherit")}>
                    Total · {monthDays.length} days
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)}>
                    {rangeCounts.present + rangeCounts.halfDay} present
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)} />
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)} />
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)}>
                    {formatDuration(rangeCounts.activeSeconds)}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)}>
                    {monthMet + monthShort > 0 ? `${monthMet} of ${monthMet + monthShort} on target` : "—"}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)}>
                    {formatBreakDuration(rangeCounts.breakSeconds)}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, totalCellClassName)}>
                    {monthOvertime > 0 ? `${monthOvertime} min` : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      sheetCellClassName,
                      totalCellClassName,
                      monthExcess > 0 && "bg-destructive/10 text-destructive"
                    )}
                  >
                    {monthExcess > 0 ? `+${formatExcess(monthExcess)}` : "—"}
                  </TableCell>
                  {seesAll ? <TableCell className={cn(sheetCellClassName, totalCellClassName, "border-r-0")} /> : null}
                </TableRow>
              </TableBody>
            </Table>
          </AttendanceSheetFrame>
        ) : null}

        {query.view === "yearly" && !employeeId ? (
          <AttendanceSheetFrame>
            <TeamSummaryTable
              employees={visibleEmployees}
              byEmployee={byEmployee}
              year={query.year}
              seesAll={seesAll}
              emptyTitle={search ? "No employees match this search" : "No employees yet"}
            />
          </AttendanceSheetFrame>
        ) : null}

        {query.view === "yearly" && employeeId ? (
          <AttendanceSheetFrame>
            <Table className="border-separate border-spacing-0">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Month</TableHead>
                  <SummaryHeads />
                  <TableHead className={cn(sheetHeadClassName, "border-r-0 text-center")}>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearMonths.map((key) => {
                  const counts = byMonth.get(key) ?? emptyAttendanceCounts();
                  const href = `/admin/attendance?view=monthly&employee=${employeeId}&month=${key}`;
                  return (
                    <TableRow key={key} className={sheetRowClassName}>
                      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit font-semibold")}>
                        {formatMonthLabel(key)}
                      </TableCell>
                      <SummaryCells counts={counts} />
                      <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5 text-center")}>
                        <Button asChild size="sm" variant="outline" className="rounded-sm">
                          <Link href={href}>Month</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AttendanceSheetFrame>
        ) : null}
      </div>
    </div>
  );
}

function employeeHistoryHref(
  employeeId: string,
  query: { view: string; date: string; month: string; year: string }
) {
  const params = new URLSearchParams();
  params.set("view", query.view);
  params.set("employee", employeeId);
  if (query.view === "daily" || query.view === "weekly") params.set("date", query.date);
  if (query.view === "monthly") params.set("month", query.month);
  if (query.view === "yearly") params.set("year", query.year);
  return `/admin/attendance?${params.toString()}`;
}

/** Live seconds are not loaded on this page, so today's row does not claim a time left. */
function dayTarget(date: string, attendance: AttendanceRecord | undefined, status: string, today: string) {
  if (!attendance) return { state: "off" as const, label: "—" };
  return targetResult(
    {
      attendance_date: date,
      status,
      total_active_seconds: creditedProductiveSeconds(attendance.total_active_seconds, status),
    },
    today,
    { showLeft: false }
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-r border-b px-3 py-1.5 last:border-r-0 sm:border-b-0">
      <dt className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("text-sm font-bold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function EmployeeCells({ employee, href }: { employee: EmployeeOption; href?: string }) {
  return (
    <>
      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit font-semibold")}>
        {href ? (
          <Link href={href} className="transition-colors hover:text-primary">
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

function DayMetricHeads({ seesAll }: { seesAll: boolean }) {
  return (
    <>
      <TableHead className={sheetHeadClassName}>Status</TableHead>
      <TableHead className={sheetHeadClassName}>Check in</TableHead>
      <TableHead className={sheetHeadClassName}>Check out</TableHead>
      <TableHead className={sheetHeadClassName}>Productive</TableHead>
      <TableHead className={sheetHeadClassName}>Target</TableHead>
      <TableHead className={sheetHeadClassName}>Break</TableHead>
      <TableHead className={sheetHeadClassName}>Overtime</TableHead>
      <TableHead className={sheetHeadClassName}>Excess break</TableHead>
      {seesAll ? (
        <TableHead className={cn(sheetHeadClassName, "border-r-0 text-center")}>Action</TableHead>
      ) : null}
    </>
  );
}

function DayMetricCells({
  employee,
  date,
  today,
  status,
  attendance,
  excess = emptyExcess(),
  leave,
  seesAll,
}: {
  employee: EmployeeOption;
  date: string;
  today: string;
  status: string;
  attendance: AttendanceRecord | undefined;
  excess?: BreakExcess;
  leave: { subject?: string | null; reason?: string | null };
  seesAll: boolean;
}) {
  const overtime = attendance?.overtime_minutes ?? 0;
  return (
    <>
      <TableCell className={cn(sheetCellClassName, "[&_[data-slot=badge]]:rounded-sm")}>
        <AttendanceLeaveMark status={status} {...leave} />
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
        {attendance?.first_check_in ? formatTime(attendance.first_check_in) : "—"}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
        {attendance?.last_check_out ? formatTime(attendance.last_check_out) : "—"}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "font-medium")}>
        {formatDuration(creditedProductiveSeconds(attendance?.total_active_seconds ?? 0, attendance?.status))}
      </TableCell>
      <TargetSheetCell target={dayTarget(date, attendance, status, today)} />
      <TableCell className={cn(sheetCellClassName, excess.total > 0 && "font-semibold text-destructive")}>
        {formatBreakDuration(attendance?.total_break_seconds ?? 0)}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
        {overtime > 0 ? `${overtime} min` : "—"}
      </TableCell>
      <ExcessSheetCell excess={excess} />
      {seesAll ? (
        <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5 text-center")}>
          <EditAttendanceDialog
            employeeId={employee.id}
            employeeName={employee.full_name}
            attendanceDate={date}
            attendance={attendance}
          />
        </TableCell>
      ) : null}
    </>
  );
}

function SummaryHeads() {
  return (
    <>
      <TableHead className={sheetHeadClassName}>Present</TableHead>
      <TableHead className={sheetHeadClassName}>Leave</TableHead>
      <TableHead className={sheetHeadClassName}>Absent</TableHead>
      <TableHead className={sheetHeadClassName}>Productive</TableHead>
      <TableHead className={sheetHeadClassName}>Break</TableHead>
    </>
  );
}

function SummaryCells({ counts }: { counts: AttendanceCounts }) {
  return (
    <>
      <TableCell className={sheetCellClassName}>{counts.present}</TableCell>
      <TableCell className={sheetCellClassName}>{counts.leave}</TableCell>
      <TableCell className={cn(sheetCellClassName, counts.absent > 0 && "font-semibold text-destructive")}>
        {counts.absent}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "font-medium")}>{formatDuration(counts.activeSeconds)}</TableCell>
      <TableCell className={sheetCellClassName}>{formatBreakDuration(counts.breakSeconds)}</TableCell>
    </>
  );
}

function AttendanceSheetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="border bg-card [&_[data-slot=table-container]]:max-h-[calc(100svh-19rem)] [&_[data-slot=table-container]]:min-h-80">
      {children}
    </div>
  );
}

function TeamSummaryTable({
  employees,
  byEmployee,
  month,
  weekDate,
  year,
  seesAll,
  emptyTitle = "No employees yet",
}: {
  employees: EmployeeOption[];
  byEmployee: Map<string, AttendanceCounts>;
  month?: string;
  /** Any day in the week being shown. */
  weekDate?: string;
  year?: string;
  seesAll: boolean;
  emptyTitle?: string;
}) {
  if (employees.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={CalendarCheck} title={emptyTitle} />
      </div>
    );
  }

  return (
    <Table className="border-separate border-spacing-0">
      <TableHeader className="sticky top-0 z-10">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
          <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
          <SummaryHeads />
          {seesAll ? (
            <TableHead className={cn(sheetHeadClassName, "border-r-0 text-center")}>Open</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => {
          const counts = byEmployee.get(employee.id) ?? emptyAttendanceCounts();
          const href = weekDate
            ? `/admin/attendance?view=weekly&employee=${employee.id}&date=${weekDate}`
            : month
              ? `/admin/attendance?view=monthly&employee=${employee.id}&month=${month}`
              : `/admin/attendance?view=yearly&employee=${employee.id}&year=${year}`;
          return (
            <TableRow key={employee.id} className={sheetRowClassName}>
              <EmployeeCells employee={employee} href={seesAll ? href : undefined} />
              <SummaryCells counts={counts} />
              {seesAll ? (
                <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5 text-center")}>
                  <Button asChild size="sm" variant="outline" className="rounded-sm">
                    <Link href={href}>{month || weekDate ? "Days" : "Months"}</Link>
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
