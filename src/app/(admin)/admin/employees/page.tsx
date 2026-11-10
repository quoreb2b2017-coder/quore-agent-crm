import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
import { EmployeesTable } from "./employees-table";
import { CreateEmployeeDialog } from "./create-employee-dialog";
import { CreateSuperAdminDialog } from "./create-super-admin-dialog";
import { loadEmployeeDirectory } from "@/lib/queries/employee-directory";
import { loadEmployeeListRows } from "@/lib/queries/employee-list";
import { loadDepartments } from "@/lib/queries/departments";
import { loadAssignableDepartmentRoles } from "@/lib/queries/assignable-roles";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isManagement, isSuperAdmin } from "@/lib/permissions/roles";

export default async function EmployeesPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const [rows, directory, departments, assignableRoles] = await Promise.all([
    loadEmployeeListRows(ctx),
    loadEmployeeDirectory(),
    loadDepartments(),
    loadAssignableDepartmentRoles(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employees"
        description="People list. Put them into Sales / Marketing / Database / IT / Admin from Teams."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExcelDownloadButton href="/api/employees/excel" />
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/teams">Teams</Link>
            </Button>
            <CreateEmployeeDialog
              key={`add-emp-${directory.length}-${departments.map((d) => d.id).join(",")}-${assignableRoles.map((r) => r.roleKey).join(",")}`}
              employees={directory}
              departments={departments}
              assignableRoles={assignableRoles}
            />
            {/* Super Admin only: HR must never see or reach this. The action checks again. */}
            {isSuperAdmin(ctx.roleKey) ? <CreateSuperAdminDialog /> : null}
          </div>
        }
      />

      <EmployeesTable
        rows={rows}
        currentEmployeeId={ctx.employeeId}
        viewerIsSuperAdmin={isSuperAdmin(ctx.roleKey)}
      />
    </div>
  );
}
