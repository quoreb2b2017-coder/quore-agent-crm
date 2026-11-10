import "server-only";

import { createDataClient as createClient } from "@/lib/supabase/data";
import { loadDepartments } from "@/lib/queries/departments";
import {
  HR_ROLE,
  isManagement,
  isStaffRole,
  isSuperAdmin,
  staffDepartmentLabel,
  SUPER_ADMIN_ROLE,
} from "@/lib/permissions/roles";
import { kindForAssignableRole, type DepartmentKind } from "@/lib/departments";
import { applyWorkSchedule, formatMinutesLabel, parseWorkSchedule } from "@/lib/work-settings";
import { loadWorkSettings } from "@/lib/work-settings-server";
import type { EmployeeContext } from "@/lib/permissions/types";

export type EmployeeListRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: string;
  shiftLabel: string;
  hasCustomShift: boolean;
  departmentName: string;
  isSuperAdmin: boolean;
};

/** Sales (Agent) first, then Marketing, Database, IT, Admin Control. */
function listRank(roleKey: string, kind: DepartmentKind | null) {
  const group = kind || kindForAssignableRole(roleKey);
  if (group === "SALES" || roleKey === "AGENT") return 0;
  if (group === "MARKETING" || roleKey === "EMAIL_MARKETING") return 1;
  if (group === "DATABASE" || roleKey === "DATABASE") return 2;
  if (group === "IT" || roleKey === "IT") return 3;
  if (group === "ADMIN_CONTROL" || roleKey === HR_ROLE) return 4;
  if (roleKey === SUPER_ADMIN_ROLE) return 9;
  if (isStaffRole(roleKey)) return 5;
  return 8;
}

/** The Employees list as the viewer may see it: Super Admin sees everyone, HR sees staff only. */
export async function loadEmployeeListRows(ctx: EmployeeContext): Promise<EmployeeListRow[]> {
  const supabase = await createClient();
  const [{ data: employees }, { data: roles }, { data: employeeRoles }, companySettings, departments] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_code, full_name, email, phone, employment_status, work_schedule, department_id")
        .order("full_name"),
      supabase.from("roles").select("id, role_key"),
      supabase.from("employee_roles").select("employee_id, role_id").eq("is_primary", true),
      loadWorkSettings(),
      loadDepartments(),
    ]);

  const roleByEmployee = new Map((employeeRoles ?? []).map((row) => [row.employee_id, row.role_id]));
  const roleKeyById = new Map((roles ?? []).map((row) => [row.id, row.role_key]));
  const departmentById = new Map(departments.map((row) => [row.id, row]));
  const viewerIsSuperAdmin = isSuperAdmin(ctx.roleKey);
  const roleKeyOf = (employeeId: string) => {
    const roleId = roleByEmployee.get(employeeId);
    return roleId ? (roleKeyById.get(roleId) ?? "") : "";
  };

  const ranked = (employees ?? [])
    .filter((employee) => viewerIsSuperAdmin || !isManagement(roleKeyOf(employee.id)))
    .map((employee) => {
      const roleKey = roleKeyOf(employee.id);
      const schedule = parseWorkSchedule(employee.work_schedule);
      const shift = applyWorkSchedule(companySettings, schedule);
      const department = employee.department_id ? departmentById.get(employee.department_id) : undefined;
      const row: EmployeeListRow = {
        id: employee.id,
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        email: employee.email,
        phone: employee.phone,
        employmentStatus: employee.employment_status,
        shiftLabel: `${formatMinutesLabel(shift.loginMinutes, shift.timeZone)} – ${formatMinutesLabel(shift.logoutMinutes, shift.timeZone)}`,
        hasCustomShift: Boolean(schedule),
        isSuperAdmin: roleKey === SUPER_ADMIN_ROLE,
        departmentName:
          department?.name ||
          (roleKey === SUPER_ADMIN_ROLE
            ? "Super Admin"
            : roleKey === HR_ROLE
              ? "Admin Control"
              : roleKey
                ? staffDepartmentLabel(roleKey)
                : "—"),
      };
      return { row, rank: listRank(roleKey, department?.kind ?? null) };
    });

  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.row.departmentName.localeCompare(b.row.departmentName) ||
        a.row.fullName.localeCompare(b.row.fullName)
    )
    .map(({ row }) => row);
}
