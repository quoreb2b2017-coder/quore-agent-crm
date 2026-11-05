import { requireSuperAdmin } from "@/lib/permissions/server";
import { isHiddenRole } from "@/lib/permissions/roles";
import { DEPARTMENT_KIND_OPTIONS, normalizeDepartmentKind } from "@/lib/departments";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/wt/panel";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { PermissionMatrix } from "./permission-matrix";
import { CreateRoleDialog } from "./create-role-dialog";
import { EditRoleDialog } from "./edit-role-dialog";

function departmentNameForKind(kind: string | null) {
  const normalized = normalizeDepartmentKind(kind);
  if (!normalized) return null;
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === normalized)?.defaultName ?? normalized;
}

export const metadata = { title: "Roles & permissions · WorkTrack" };
export const dynamic = "force-dynamic";

const ROLE_ORDER = ["SUPER_ADMIN", "HR", "AGENT", "EMAIL_MARKETING", "DATABASE", "IT"];

export default async function RolesPage() {
  await requireSuperAdmin();
  const service = createServiceClient();
  const [{ data: roles }, { data: permissions }, { data: grants }, { data: members }] = await Promise.all([
    service
      .from("roles")
      .select("id, role_key, display_name, description, department_kind, is_system"),
    service.from("permissions").select("id, permission_key, description, category").order("permission_key"),
    service.from("role_permissions").select("role_id, permission_id"),
    service.from("employee_roles").select("role_id"),
  ]);
  const count = new Map<string, number>();
  for (const m of members ?? []) count.set(m.role_id, (count.get(m.role_id) ?? 0) + 1);
  const ordered = [...(roles ?? [])]
    .map((r) => ({ ...r, members: count.get(r.id) ?? 0 }))
    .filter(
      (r) =>
        !isHiddenRole(r.role_key) &&
        (ROLE_ORDER.includes(r.role_key) || !r.is_system || r.members > 0)
    )
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.role_key);
      const ib = ROLE_ORDER.indexOf(b.role_key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.display_name.localeCompare(b.display_name);
    });
  const grantCount = new Map<string, number>();
  for (const grant of grants ?? []) grantCount.set(grant.role_id, (grantCount.get(grant.role_id) ?? 0) + 1);
  const assignedPeople = ordered.reduce((sum, role) => sum + role.members, 0);
  const emptyRoles = ordered.filter((role) => role.members === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Roles & permissions"
        description="Create or edit roles, then set who can do what. Permission changes stay as drafts until you save."
        actions={<CreateRoleDialog />}
      />

      <div className="flex flex-col [&>*+*]:-mt-px">
        <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
          <SheetKpi label="Roles" value={ordered.length} hint={`${ordered.filter((role) => !role.is_system).length} custom`} />
          <SheetKpi label="People with a role" value={assignedPeople} valueClassName="text-success" />
          <SheetKpi label="Permissions" value={permissions?.length ?? 0} hint="Grouped by area below" />
          <SheetKpi
            label="Roles with no one"
            value={emptyRoles}
            valueClassName={emptyRoles > 0 ? "text-warning" : undefined}
            hint="Can be reviewed or removed"
          />
        </dl>

        <section className="border bg-card">
          <div className="border-b bg-muted px-3 py-2">
            <h2 className="text-sm font-semibold">Roles</h2>
            <p className="text-xs text-muted-foreground">Who the role is for, and how much it can do</p>
          </div>
          <Table className="border-separate border-spacing-0">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={sheetHeadClassName}>Role</TableHead>
                <TableHead className={sheetHeadClassName}>Role key</TableHead>
                <TableHead className={sheetHeadClassName}>Type</TableHead>
                <TableHead className={sheetHeadClassName}>Department</TableHead>
                <TableHead className={cn(sheetHeadClassName, "text-right")}>People</TableHead>
                <TableHead className={cn(sheetHeadClassName, "text-right")}>Permissions</TableHead>
                <TableHead className={sheetHeadClassName}>Description</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-20 border-r-0 text-center")}>Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((role) => (
                <TableRow key={role.id} className={sheetRowClassName}>
                  <TableCell className={cn(sheetCellClassName, "font-semibold")}>{role.display_name}</TableCell>
                  <TableCell className={cn(sheetCellClassName, "font-mono text-xs text-muted-foreground")}>
                    {role.role_key}
                  </TableCell>
                  <TableCell className={sheetCellClassName}>
                    <Pill className="rounded-sm" tone={role.is_system ? "neutral" : "brand"}>
                      {role.is_system ? "System" : "Custom"}
                    </Pill>
                  </TableCell>
                  <TableCell className={sheetCellClassName}>
                    {departmentNameForKind(role.department_kind) ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "text-right font-semibold", role.members === 0 && "text-muted-foreground")}>
                    {role.members}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "text-right")}>
                    {grantCount.get(role.id) ?? 0} of {permissions?.length ?? 0}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "min-w-52 whitespace-normal text-muted-foreground")}>
                    {role.description || "—"}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5 text-center")}>
                    <EditRoleDialog role={role} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <PermissionMatrix roles={ordered} permissions={permissions ?? []} grants={grants ?? []} />
    </div>
  );
}
