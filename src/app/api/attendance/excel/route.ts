import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { addAttendanceRow, emptyAttendanceCounts, parseAttendanceQuery } from "@/lib/attendance-period";
import { formatBreakDuration, formatDuration, formatIsoDate, formatTime } from "@/lib/format";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const MAX_ROWS = 40000;

function statusLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The Attendance page's filters as a workbook: one sheet per day of attendance, one total per person. */
export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const seesAll = isManagement(ctx.roleKey);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  // Staff can only ever export their own days, whatever the link says.
  const query = parseAttendanceQuery(params, seesAll ? null : ctx.employeeId);
  const search = (params.q ?? "").trim().toLowerCase();
  const service = createServiceClient();

  const adminIds = new Set(seesAll ? await superAdminEmployeeIds() : []);
  let peopleQuery = service.from("employees").select("id, full_name, employee_code").order("full_name");
  if (!seesAll) peopleQuery = peopleQuery.eq("id", ctx.employeeId);
  else if (query.employeeId) peopleQuery = peopleQuery.eq("id", query.employeeId);
  const { data: peopleRows } = await peopleQuery;
  const people = (peopleRows ?? []).filter(
    (person) =>
      !adminIds.has(person.id) &&
      (!search ||
        person.full_name.toLowerCase().includes(search) ||
        person.employee_code.toLowerCase().includes(search))
  );
  const byId = new Map(people.map((person) => [person.id, person]));

  const records: {
    employee_id: string;
    attendance_date: string;
    status: string;
    first_check_in: string | null;
    last_check_out: string | null;
    total_active_seconds: number;
    total_break_seconds: number;
    overtime_minutes: number;
    notes: string | null;
  }[] = [];
  const ids = people.map((person) => person.id);
  for (let from = 0; ids.length > 0 && from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await service
      .from("attendance")
      .select(
        "employee_id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, overtime_minutes, notes"
      )
      .in("employee_id", ids)
      .gte("attendance_date", query.start)
      .lte("attendance_date", query.end)
      .order("attendance_date")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    records.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  records.sort(
    (a, b) =>
      (byId.get(a.employee_id)?.full_name ?? "").localeCompare(byId.get(b.employee_id)?.full_name ?? "") ||
      a.attendance_date.localeCompare(b.attendance_date)
  );

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Present", key: "present", width: 10 },
    { header: "Half day", key: "halfDay", width: 10 },
    { header: "Leave", key: "leave", width: 9 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Productive", key: "productive", width: 13 },
    { header: "Break", key: "break", width: 11 },
  ];
  const counts = new Map(people.map((person) => [person.id, emptyAttendanceCounts()]));
  for (const row of records) {
    const current = counts.get(row.employee_id);
    if (current) addAttendanceRow(current, row);
  }
  for (const person of people) {
    const total = counts.get(person.id) ?? emptyAttendanceCounts();
    summary.addRow({
      name: person.full_name,
      code: person.employee_code,
      present: total.present,
      halfDay: total.halfDay,
      leave: total.leave,
      absent: total.absent,
      productive: formatDuration(total.activeSeconds),
      break: formatBreakDuration(total.breakSeconds),
    });
  }
  finishSheet(summary);

  const days = workbook.addWorksheet("Days");
  days.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Date", key: "date", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Check in", key: "checkIn", width: 11 },
    { header: "Check out", key: "checkOut", width: 11 },
    { header: "Productive", key: "productive", width: 12 },
    { header: "Break", key: "break", width: 10 },
    { header: "Overtime (min)", key: "overtime", width: 14 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const row of records) {
    const person = byId.get(row.employee_id);
    days.addRow({
      name: person?.full_name ?? "",
      code: person?.employee_code ?? "",
      date: formatIsoDate(row.attendance_date),
      status: statusLabel(row.status),
      checkIn: row.first_check_in ? formatTime(row.first_check_in) : "",
      checkOut: row.last_check_out ? formatTime(row.last_check_out) : "",
      productive: formatDuration(row.total_active_seconds ?? 0),
      break: formatBreakDuration(row.total_break_seconds ?? 0),
      overtime: row.overtime_minutes ?? 0,
      notes: row.notes ?? "",
    });
  }
  finishSheet(days);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${query.start}-to-${query.end}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
