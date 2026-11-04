import { requireSuperAdmin } from "@/lib/permissions/server";
import { isHiddenRole } from "@/lib/permissions/roles";
import { DEPARTMENT_KIND_OPTIONS, normalizeDepartmentKind } from "@/lib/departments";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roles & permissions"
        description="Create or edit roles, then set who can do what. Permission changes stay as drafts until you save."
        actions={<CreateRoleDialog />}
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((role) => (
          <div key={role.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{role.display_name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {role.role_key}
                  {role.is_system ? " · system" : ""}
                </p>
              </div>
              <EditRoleDialog role={role} />
            </div>
            <p className="text-xs text-muted-foreground">
              {departmentNameForKind(role.department_kind)
                ? `${departmentNameForKind(role.department_kind)} · `
                : ""}
              {role.members} {role.members === 1 ? "person" : "people"}
              {role.description ? ` · ${role.description}` : ""}
            </p>
          </div>
        ))}
      </section>
      <PermissionMatrix roles={ordered} permissions={permissions ?? []} grants={grants ?? []} />
    </div>
  );
}
