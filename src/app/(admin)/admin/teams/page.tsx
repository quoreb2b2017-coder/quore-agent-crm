import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isManagement, isSuperAdmin } from "@/lib/permissions/roles";
import { loadDepartments } from "@/lib/queries/departments";
import { loadAssignableDepartmentRoles } from "@/lib/queries/assignable-roles";
import { loadEmployeeDirectory } from "@/lib/queries/employee-directory";
import { TeamsBoard } from "./teams-board";

export const metadata = { title: "Teams · WorkTrack" };
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const [departments, employees, assignableRoles] = await Promise.all([
    loadDepartments(),
    loadEmployeeDirectory(),
    loadAssignableDepartmentRoles(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teams"
        description="One place for departments. Open a team on the left, add or move people on the right. Role is set automatically."
      />
      <TeamsBoard
        departments={departments}
        employees={employees}
        assignableRoles={assignableRoles}
        canManageRoles={isSuperAdmin(ctx.roleKey)}
      />
    </div>
  );
}
