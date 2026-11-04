import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import {
  HR_ROLE,
  isHiddenRole,
  isHr,
  SUPER_ADMIN_ROLE,
} from "@/lib/permissions/roles";
import type { AssignableRoleKey } from "@/lib/departments";
import { parseWorkSchedule, type WorkSchedule } from "@/lib/work-settings";

export type EmployeeDirectoryOption = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  employeeCode: string;
  joiningDate: string;
  dateOfBirth: string;
  /** App role under the department (Agent / Database / Email Marketing / HR). */
  roleKey: AssignableRoleKey;
  /** Org department row id when set. */
  departmentId: string | null;
  schedule: WorkSchedule | null;
};

/** Active staff for Add Employee: department filter → pick → autofill. */
export async function loadEmployeeDirectory(): Promise<EmployeeDirectoryOption[]> {
  // Service client: admin directory must see every staff/HR role link (RLS can hide rows).
  const supabase = createServiceClient();
  const adminIds = await superAdminEmployeeIds(supabase);
  const skip = excludeIds(adminIds);

  let employeesQuery = supabase
    .from("employees")
    .select(
      "id, full_name, email, phone, employee_code, joining_date, work_schedule, employment_status, department_id"
    )
    .neq("employment_status", "TERMINATED")
    .order("full_name");
  if (skip) employeesQuery = employeesQuery.not("id", "in", skip);

  const [{ data: employees }, { data: links }, { data: roles }, { data: onboarding }] =
    await Promise.all([
      employeesQuery,
      supabase.from("employee_roles").select("employee_id, role_id").eq("is_primary", true),
      supabase.from("roles").select("id, role_key"),
      supabase.from("employee_onboarding").select("employee_id, date_of_birth"),
    ]);

  const roleKeyById = new Map((roles ?? []).map((role) => [role.id, role.role_key]));
  const roleByEmployee = new Map(
    (links ?? []).map((link) => [link.employee_id, roleKeyById.get(link.role_id) ?? ""])
  );
  const dobByEmployee = new Map(
    (onboarding ?? []).map((row) => [row.employee_id, row.date_of_birth ?? ""])
  );

  const rows: EmployeeDirectoryOption[] = [];
  for (const employee of employees ?? []) {
    const roleKey = String(roleByEmployee.get(employee.id) ?? "").trim();
    if (!roleKey || roleKey === SUPER_ADMIN_ROLE || isHiddenRole(roleKey)) continue;
    rows.push({
      id: employee.id,
      fullName: employee.full_name,
      email: employee.email,
      phone: employee.phone ?? "",
      employeeCode: employee.employee_code,
      joiningDate: employee.joining_date,
      dateOfBirth: dobByEmployee.get(employee.id) ?? "",
      roleKey: (isHr(roleKey) ? HR_ROLE : roleKey) as AssignableRoleKey,
      departmentId: employee.department_id,
      schedule: parseWorkSchedule(employee.work_schedule),
    });
  }

  // Sales → Marketing → Database → IT → Admin.
  const roleRank = (roleKey: string) =>
    roleKey === "AGENT"
      ? 0
      : roleKey === "EMAIL_MARKETING"
        ? 1
        : roleKey === "DATABASE"
          ? 2
          : roleKey === "IT"
            ? 3
            : roleKey === HR_ROLE
              ? 4
              : 5;

  return rows.sort(
    (a, b) =>
      roleRank(a.roleKey) - roleRank(b.roleKey) || a.fullName.localeCompare(b.fullName)
  );
}
