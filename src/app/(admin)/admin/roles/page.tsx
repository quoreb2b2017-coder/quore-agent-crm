import { requireSuperAdmin } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { PermissionMatrix } from "./permission-matrix";
import { CreateRoleDialog } from "./create-role-dialog";

export const metadata = { title: "Roles & permissions · WorkTrack" };
export const dynamic = "force-dynamic";

const ROLE_ORDER = ["SUPER_ADMIN", "HR", "AGENT", "DATABASE", "EMAIL_MARKETING"];

export default async function RolesPage() {
  await requireSuperAdmin();
  const service = createServiceClient();
  const [{ data: roles }, { data: permissions }, { data: grants }, { data: members }] = await Promise.all([
    service.from("roles").select("id, role_key, display_name, is_system"),
    service.from("permissions").select("id, permission_key, description, category").order("permission_key"),
    service.from("role_permissions").select("role_id, permission_id"),
    service.from("employee_roles").select("role_id"),
  ]);
  const count = new Map<string, number>();
  for (const m of members ?? []) count.set(m.role_id, (count.get(m.role_id) ?? 0) + 1);
  const ordered = [...(roles ?? [])]
    .map((r) => ({ ...r, members: count.get(r.id) ?? 0 }))
    .filter((r) => ROLE_ORDER.includes(r.role_key) || !r.is_system || r.members > 0)
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.role_key);
      const ib = ROLE_ORDER.indexOf(b.role_key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.display_name.localeCompare(b.display_name);
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roles & permissions"
        description="Who can do what. Changes are drafts until you save them, and conflicting combinations are flagged before you do."
        actions={<CreateRoleDialog />}
      />
      <PermissionMatrix roles={ordered} permissions={permissions ?? []} grants={grants ?? []} />
    </div>
  );
}
