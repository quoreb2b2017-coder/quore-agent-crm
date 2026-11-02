import { redirect } from "next/navigation";
import { Users, UserCheck, UserX } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmployeesTable } from "./employees-table";
import { CreateEmployeeDialog } from "./create-employee-dialog";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import {
  HR_ROLE,
  isManagement,
  isSuperAdmin,
  staffDepartmentLabel,
  SUPER_ADMIN_ROLE,
} from "@/lib/permissions/roles";
import { isEmploymentActive } from "@/lib/format";

export default async function EmployeesPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();

  // Independent reads, fetched in parallel (role assignments no longer wait for the employee list).
  const [{ data: employees }, { data: roles }, { data: employeeRoles }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, full_name, email, phone, employment_status")
      .order("full_name"),
    supabase.from("roles").select("id, role_key").order("display_name"),
    supabase.from("employee_roles").select("employee_id, role_id").eq("is_primary", true),
  ]);

  const roleByEmployee = new Map((employeeRoles ?? []).map((r) => [r.employee_id, r.role_id]));
  const roleKeyById = new Map((roles ?? []).map((r) => [r.id, r.role_key]));

  const viewerIsSuperAdmin = isSuperAdmin(ctx.roleKey);
  const roleKeyOf = (employeeId: string) => {
    const roleId = roleByEmployee.get(employeeId);
    return roleId ? roleKeyById.get(roleId) ?? "" : "";
  };

  const rows = (employees ?? [])
    .filter((e) => viewerIsSuperAdmin || !isManagement(roleKeyOf(e.id)))
    .map((e) => {
    const roleKey = roleKeyOf(e.id);
    return {
      id: e.id,
      employeeCode: e.employee_code,
      fullName: e.full_name,
      email: e.email,
      phone: e.phone,
      employmentStatus: e.employment_status,
      departmentName:
        roleKey === SUPER_ADMIN_ROLE
          ? "Super Admin"
          : roleKey === HR_ROLE
            ? "HR"
            : roleKey
            ? staffDepartmentLabel(roleKey)
            : "—",
    };
  });

  const total = rows.length;
  const active = rows.filter((row) => isEmploymentActive(row.employmentStatus)).length;
  const inactive = total - active;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="People in this workspace. Active includes on-leave. Inactive is blocked or terminated."
        actions={<CreateEmployeeDialog />}
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
