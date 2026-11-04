import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, UserCheck, UserX } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { EmployeesTable } from "./employees-table";
import { CreateEmployeeDialog } from "./create-employee-dialog";
import { loadEmployeeDirectory } from "@/lib/queries/employee-directory";
import { loadDepartments } from "@/lib/queries/departments";
import { loadAssignableDepartmentRoles } from "@/lib/queries/assignable-roles";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import {
  HR_ROLE,
  isManagement,
  isStaffRole,
  isSuperAdmin,
  staffDepartmentLabel,
  SUPER_ADMIN_ROLE,
} from "@/lib/permissions/roles";
import { kindForAssignableRole, type DepartmentKind } from "@/lib/departments";
import { isEmploymentActive } from "@/lib/format";
import {
  applyWorkSchedule,
  formatMinutesLabel,
  parseWorkSchedule,
} from "@/lib/work-settings";
import { loadWorkSettings } from "@/lib/work-settings-server";

export default async function EmployeesPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();

  const [
    { data: employees },
    { data: roles },
    { data: employeeRoles },
    companySettings,
    directory,
    departments,
    assignableRoles,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, employee_code, full_name, email, phone, employment_status, work_schedule, department_id"
      )
      .order("full_name"),
    supabase.from("roles").select("id, role_key").order("display_name"),
    supabase.from("employee_roles").select("employee_id, role_id").eq("is_primary", true),
    loadWorkSettings(),
    loadEmployeeDirectory(),
    loadDepartments(),
    loadAssignableDepartmentRoles(),
  ]);

  const roleByEmployee = new Map((employeeRoles ?? []).map((r) => [r.employee_id, r.role_id]));
  const roleKeyById = new Map((roles ?? []).map((r) => [r.id, r.role_key]));
  const departmentNameById = new Map(departments.map((row) => [row.id, row.name]));
  const departmentKindById = new Map(departments.map((row) => [row.id, row.kind]));

  const viewerIsSuperAdmin = isSuperAdmin(ctx.roleKey);
  const roleKeyOf = (employeeId: string) => {
    const roleId = roleByEmployee.get(employeeId);
    return roleId ? roleKeyById.get(roleId) ?? "" : "";
  };

  /** Sales (Agent) first, then Marketing, Database, IT, Admin Control. */
  function listRank(roleKey: string, departmentId: string | null) {
    const kind: DepartmentKind | null =
      (departmentId && departmentKindById.get(departmentId)) ||
      kindForAssignableRole(roleKey);
    if (kind === "SALES" || roleKey === "AGENT") return 0;
    if (kind === "MARKETING" || roleKey === "EMAIL_MARKETING") return 1;
    if (kind === "DATABASE" || roleKey === "DATABASE") return 2;
    if (kind === "IT" || roleKey === "IT") return 3;
    if (kind === "ADMIN_CONTROL" || roleKey === HR_ROLE) return 4;
    if (roleKey === SUPER_ADMIN_ROLE) return 9;
    if (isStaffRole(roleKey)) return 5;
    return 8;
  }

  // Super Admin sees everyone (including HR / Admin Control). HR sees staff only.
  const rows = (employees ?? [])
    .filter((e) => {
      const key = roleKeyOf(e.id);
      if (viewerIsSuperAdmin) return true;
      return !isManagement(key);
    })
    .map((e) => {
      const roleKey = roleKeyOf(e.id);
      const schedule = parseWorkSchedule(e.work_schedule);
      const shift = applyWorkSchedule(companySettings, schedule);
      const shiftLabel = `${formatMinutesLabel(shift.loginMinutes, shift.timeZone)} – ${formatMinutesLabel(shift.logoutMinutes, shift.timeZone)}`;
      const orgDepartment = e.department_id ? departmentNameById.get(e.department_id) : null;
      return {
        id: e.id,
        employeeCode: e.employee_code,
        fullName: e.full_name,
        email: e.email,
        phone: e.phone,
        employmentStatus: e.employment_status,
        shiftLabel: schedule ? shiftLabel : `${shiftLabel} · company`,
        departmentName:
          orgDepartment ||
          (roleKey === SUPER_ADMIN_ROLE
            ? "Super Admin"
            : roleKey === HR_ROLE
              ? "Admin Control"
              : roleKey
                ? staffDepartmentLabel(roleKey)
                : "—"),
        _rank: listRank(roleKey, e.department_id),
      };
    })
    .sort(
      (a, b) =>
        a._rank - b._rank ||
        a.departmentName.localeCompare(b.departmentName) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map(({ _rank: _ignored, ...row }) => row);

  const total = rows.length;
  const active = rows.filter((row) => isEmploymentActive(row.employmentStatus)).length;
  const inactive = total - active;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="People list. Put them into Sales / Marketing / Database / IT / Admin from Teams."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/teams">Teams</Link>
            </Button>
            <CreateEmployeeDialog
              key={`add-emp-${directory.length}-${departments.map((d) => d.id).join(",")}-${assignableRoles.map((r) => r.roleKey).join(",")}`}
              employees={directory}
              departments={departments}
              assignableRoles={assignableRoles}
            />
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total employees" value={total} icon={Users} />
        <StatCard
          label="Active employees"
          value={active}
          icon={UserCheck}
          tone="success"
          hint={total > 0 ? `${Math.round((active / total) * 100)}% of team` : undefined}
          progress={total > 0 ? (active / total) * 100 : 0}
        />
        <StatCard
          label="Inactive employees"
          value={inactive}
          icon={UserX}
          tone="destructive"
          hint="Blocked or terminated"
          progress={total > 0 ? (inactive / total) * 100 : 0}
        />
      </section>

      <EmployeesTable
        rows={rows}
        currentEmployeeId={ctx.employeeId}
        canDelete={viewerIsSuperAdmin}
      />
    </div>
  );
}
