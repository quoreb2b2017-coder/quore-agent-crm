import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, UserRound, Timer } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
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
  eachDateInclusive,
  formatDuration,
  formatIsoDate,
  formatMonthLabel,
  formatTime,
  isWeekendIso,
  shiftWindowLabel,
} from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import { ensureStaffWeekendOff, weekendOrRecordedStatus } from "@/lib/attendance-weekend";
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { AttendanceFilters } from "@/components/attendance/attendance-filters";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import {
  addAttendanceRow,
  emptyAttendanceCounts,
  monthKeysForYear,
  parseAttendanceQuery,
  type AttendanceCounts,
} from "@/lib/attendance-period";

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
};

type EmployeeOption = {
  id: string;
  full_name: string;
  employee_code: string;
};

const ATTENDANCE_COLUMNS =
  "id, employee_id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, notes";

function periodLabel(query: ReturnType<typeof parseAttendanceQuery>) {
  if (query.view === "daily") return formatIsoDate(query.date);
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
  const supabase = await createClient();
  const adminIds = seesAll ? await superAdminEmployeeIds(supabase) : [];
  const adminSet = new Set(adminIds);
  const skipAdmins = excludeIds(adminIds);
  const employeeId =
    query.employeeId && !adminSet.has(query.employeeId) ? query.employeeId : null;

  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .neq("employment_status", "TERMINATED")
    .order("full_name");
  if (!seesAll) employeesQuery = employeesQuery.eq("id", ctx.employeeId);
  else if (skipAdmins) employeesQuery = employeesQuery.not("id", "in", skipAdmins);

  const { data: employeeRows } = await employeesQuery;
  const employees = (employeeRows ?? []) as EmployeeOption[];

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

  const { data: attendanceRows } = await attendanceQuery;
  const records = (attendanceRows ?? []) as AttendanceRecord[];

  const scopedEmployees = employeeId
    ? employees.filter((employee) => employee.id === employeeId)
    : employees;

  const titlePerson = selectedEmployee?.full_name ?? (seesAll ? "All employees" : ctx.fullName);
  const description = `${shiftWindowLabel()} · ${titlePerson} · ${periodLabel(query)}`;

  const dailyRoster =
    query.view === "daily"
      ? scopedEmployees.map((employee) => ({
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

  const rangeCounts = query.view === "daily" ? dailyCounts : countsFromRows(records);
  const byEmployee = new Map<string, AttendanceCounts>();
  for (const employee of scopedEmployees) {
    byEmployee.set(employee.id, emptyAttendanceCounts());
  }
  for (const row of records) {
    const current = byEmployee.get(row.employee_id) ?? emptyAttendanceCounts();
    addAttendanceRow(current, row);
    byEmployee.set(row.employee_id, current);
  }

  const byDate = new Map(records.map((row) => [row.attendance_date, row]));
  const monthDays =
    query.view === "monthly" && employeeId ? eachDateInclusive(query.start, query.end) : [];
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attendance" description={description} />

      <AttendanceFilters
        canPickEmployee={seesAll}
        employees={employees}
        view={query.view}
        employeeId={employeeId}
        date={query.date}
        month={query.month}
        year={query.year}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Present" value={rangeCounts.present} icon={CalendarCheck} tone="success" />
        <StatCard label="On leave" value={rangeCounts.leave} icon={UserRound} tone="info" />
        <StatCard label="Absent" value={rangeCounts.absent} icon={UserRound} tone="destructive" />
        <StatCard
          label="Productive"
          value={formatDuration(rangeCounts.activeSeconds)}
          icon={Timer}
          tone="success"
          hint={`Breaks ${formatDuration(rangeCounts.breakSeconds)}`}
        />
      </div>

      {query.view === "daily" ? (
        dailyRoster.length === 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-4">
              <EmptyState icon={CalendarCheck} title="No employees in this view" />
            </CardContent>
          </Card>
        ) : (
        <AttendanceTableCard emptyTitle="No employees in this view">
          <Table>
            <TableHeader>
              <TableRow>
                {employeeId ? null : <TableHead>Employee</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Check in</TableHead>
                <TableHead>Check out</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Break</TableHead>
                {seesAll ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRoster.map(({ employee, attendance }) => (
                <TableRow key={employee.id}>
                  {employeeId ? null : (
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                  )}
                  <TableCell>
                    <AttendanceStatusBadge
                      status={weekendOrRecordedStatus(query.date, attendance?.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {attendance?.first_check_in ? formatTime(attendance.first_check_in) : "—"}
                  </TableCell>
                  <TableCell>
                    {attendance?.last_check_out ? formatTime(attendance.last_check_out) : "—"}
                  </TableCell>
                  <TableCell>{formatDuration(attendance?.total_active_seconds ?? 0)}</TableCell>
                  <TableCell>{formatDuration(attendance?.total_break_seconds ?? 0)}</TableCell>
                  {seesAll ? (
                    <TableCell className="text-right">
                      <EditAttendanceDialog
                        employeeId={employee.id}
                        employeeName={employee.full_name}
                        attendanceDate={query.date}
                        attendance={attendance}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AttendanceTableCard>
        )
      ) : null}

      {query.view === "monthly" && !employeeId ? (
        <AttendanceTableCard emptyTitle="No employees yet">
          <TeamSummaryTable
            employees={scopedEmployees}
            byEmployee={byEmployee}
            month={query.month}
            seesAll={seesAll}
          />
        </AttendanceTableCard>
      ) : null}

      {query.view === "monthly" && employeeId ? (
        <AttendanceTableCard emptyTitle="No days in this month">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check in</TableHead>
                <TableHead>Check out</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Break</TableHead>
                {seesAll ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthDays.map((day) => {
                const attendance = byDate.get(day);
                const employee = selectedEmployee ?? scopedEmployees[0];
                if (!employee) return null;
                return (
                  <TableRow key={day}>
                    <TableCell>{formatIsoDate(day)}</TableCell>
                    <TableCell>
                      <AttendanceStatusBadge
                        status={weekendOrRecordedStatus(day, attendance?.status, "NO_RECORD")}
                      />
                    </TableCell>
                    <TableCell>
                      {attendance?.first_check_in ? formatTime(attendance.first_check_in) : "—"}
                    </TableCell>
                    <TableCell>
                      {attendance?.last_check_out ? formatTime(attendance.last_check_out) : "—"}
                    </TableCell>
                    <TableCell>{formatDuration(attendance?.total_active_seconds ?? 0)}</TableCell>
                    <TableCell>{formatDuration(attendance?.total_break_seconds ?? 0)}</TableCell>
                    {seesAll ? (
                      <TableCell className="text-right">
                        <EditAttendanceDialog
                          employeeId={employee.id}
                          employeeName={employee.full_name}
                          attendanceDate={day}
                          attendance={attendance}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AttendanceTableCard>
      ) : null}

      {query.view === "yearly" && !employeeId ? (
        <AttendanceTableCard emptyTitle="No employees yet">
          <TeamSummaryTable
            employees={scopedEmployees}
            byEmployee={byEmployee}
            year={query.year}
            seesAll={seesAll}
          />
        </AttendanceTableCard>
      ) : null}

      {query.view === "yearly" && employeeId ? (
        <AttendanceTableCard emptyTitle="No months to show">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Leave</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Break</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearMonths.map((key) => {
                const counts = byMonth.get(key) ?? emptyAttendanceCounts();
                const href = `/admin/attendance?view=monthly&employee=${employeeId}&month=${key}`;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{formatMonthLabel(key)}</TableCell>
                    <TableCell>{counts.present}</TableCell>
                    <TableCell>{counts.leave}</TableCell>
                    <TableCell>{counts.absent}</TableCell>
                    <TableCell>{formatDuration(counts.activeSeconds)}</TableCell>
                    <TableCell>{formatDuration(counts.breakSeconds)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={href}>Month</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AttendanceTableCard>
      ) : null}
    </div>
  );
}

function EmployeeCell({ employee }: { employee: EmployeeOption }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{employee.full_name}</span>
      <span className="text-xs text-muted-foreground">{employee.employee_code}</span>
    </div>
  );
}

function AttendanceTableCard({
  children,
  emptyTitle,
}: {
  children: ReactNode;
  emptyTitle: string;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        {children ?? (
          <div className="p-4">
            <EmptyState icon={CalendarCheck} title={emptyTitle} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSummaryTable({
  employees,
  byEmployee,
  month,
  year,
  seesAll,
}: {
  employees: EmployeeOption[];
  byEmployee: Map<string, AttendanceCounts>;
  month?: string;
  year?: string;
  seesAll: boolean;
}) {
  if (employees.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={CalendarCheck} title="No employees yet" />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Present</TableHead>
          <TableHead>Leave</TableHead>
          <TableHead>Absent</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Break</TableHead>
          {seesAll ? <TableHead className="text-right">Open</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => {
          const counts = byEmployee.get(employee.id) ?? emptyAttendanceCounts();
          const href = month
            ? `/admin/attendance?view=monthly&employee=${employee.id}&month=${month}`
            : `/admin/attendance?view=yearly&employee=${employee.id}&year=${year}`;
          return (
            <TableRow key={employee.id}>
              <TableCell>
                <EmployeeCell employee={employee} />
              </TableCell>
              <TableCell>{counts.present}</TableCell>
              <TableCell>{counts.leave}</TableCell>
              <TableCell>{counts.absent}</TableCell>
              <TableCell>{formatDuration(counts.activeSeconds)}</TableCell>
              <TableCell>{formatDuration(counts.breakSeconds)}</TableCell>
              {seesAll ? (
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={href}>{month ? "Days" : "Months"}</Link>
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
