import { createDataClient as createClient } from "@/lib/supabase/data";
import { todayIso } from "@/lib/format";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/roles";
import { weekendOrRecordedStatus } from "@/lib/attendance-weekend";

export async function superAdminEmployeeIds(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", SUPER_ADMIN_ROLE)
    .maybeSingle();
  if (!role) return [];
  const { data: rows } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role_id", role.id);
  return Array.from(new Set((rows ?? []).map((row) => row.employee_id)));
}

export function excludeIds(ids: string[]) {
  if (ids.length === 0) return null;
  return `(${ids.join(",")})`;
}

export async function isSuperAdminEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string
) {
  const ids = await superAdminEmployeeIds(supabase);
  return ids.includes(employeeId);
}

export async function listWatchableEmployees() {
  const supabase = await createClient();
  const adminIds = await superAdminEmployeeIds(supabase);
  let query = supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .neq("employment_status", "TERMINATED")
    .order("full_name");
  const skip = excludeIds(adminIds);
  if (skip) query = query.not("id", "in", skip);
  const { data } = await query;
  return data ?? [];
}

export type TeamTodayRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  status: string;
  activeSeconds: number;
  breakSeconds: number;
};

export async function getTodayTeamReport(
  people?: { id: string; full_name: string; employee_code: string }[]
): Promise<TeamTodayRow[]> {
  const staff = people ?? (await listWatchableEmployees());
  if (staff.length === 0) return [];

  const supabase = await createClient();
  const { data: attendance } = await supabase
    .from("attendance")
    .select("employee_id, status, total_active_seconds, total_break_seconds")
    .eq("attendance_date", todayIso())
    .in(
      "employee_id",
      staff.map((person) => person.id)
    );

  const byId = new Map((attendance ?? []).map((row) => [row.employee_id, row]));
  return staff.map((person) => {
    const row = byId.get(person.id);
    return {
      id: person.id,
      fullName: person.full_name,
      employeeCode: person.employee_code,
      status: weekendOrRecordedStatus(todayIso(), row?.status),
      activeSeconds: row?.total_active_seconds ?? 0,
      breakSeconds: row?.total_break_seconds ?? 0,
    };
  });
}

export type AdminDashboardStats = {
  totalEmployees: number;
  onlineEmployees: number;
  onBreakEmployees: number;
  offlineEmployees: number;
  idleEmployees: number;
  todaysAttendance: number;
  lateEmployees: number;
  totalWorkingHours: number;
  totalBreakHours: number;
  totalIdleHours: number;
};

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const supabase = await createClient();
  const today = todayIso();
  const adminIds = await superAdminEmployeeIds(supabase);
  const skip = excludeIds(adminIds);

  let employeesQuery = supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("employment_status", "ACTIVE");
  if (skip) employeesQuery = employeesQuery.not("id", "in", skip);

  const [
    { count: totalEmployees },
    { data: activeSessions },
    { data: openBreaks },
    { data: attendanceToday },
  ] = await Promise.all([
    employeesQuery,
    supabase.from("employee_sessions").select("id, employee_id").eq("status", "ACTIVE"),
    supabase.from("breaks").select("session_id").is("ended_at", null),
    supabase
      .from("attendance")
      .select("employee_id, status, total_active_seconds, total_break_seconds, total_idle_seconds")
      .eq("attendance_date", today),
  ]);

  const adminSet = new Set(adminIds);
  const openBreakSessionIds = new Set((openBreaks ?? []).map((b) => b.session_id));
  const sessions = (activeSessions ?? []).filter((s) => !adminSet.has(s.employee_id));
  const onBreakEmployees = sessions.filter((s) => openBreakSessionIds.has(s.id)).length;
  const onlineEmployees = sessions.length - onBreakEmployees;

  const attendance = (attendanceToday ?? []).filter((row) => !adminSet.has(row.employee_id));
  const totalWorkingSeconds = attendance.reduce((sum, a) => sum + a.total_active_seconds, 0);
  const totalBreakSeconds = attendance.reduce((sum, a) => sum + a.total_break_seconds, 0);
  const totalIdleSeconds = attendance.reduce((sum, a) => sum + a.total_idle_seconds, 0);

  const total = totalEmployees ?? 0;

  return {
    totalEmployees: total,
    onlineEmployees,
    onBreakEmployees,
    offlineEmployees: Math.max(total - onlineEmployees - onBreakEmployees, 0),
    idleEmployees: 0,
    todaysAttendance: attendance.filter((a) => a.status === "PRESENT").length,
    lateEmployees: 0,
    totalWorkingHours: Math.round((totalWorkingSeconds / 3600) * 10) / 10,
    totalBreakHours: Math.round((totalBreakSeconds / 3600) * 10) / 10,
    totalIdleHours: Math.round((totalIdleSeconds / 3600) * 10) / 10,
  };
}
