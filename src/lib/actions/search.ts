"use server";

import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isManagement } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";

export type PersonResult = {
  id: string;
  name: string;
  code: string;
  role: string;
  href: string;
};

/**
 * People search for the command palette. Only Super Admin and HR can look up
 * colleagues; everyone else gets an empty list, so the palette never reveals
 * who works here to roles that cannot open employee records.
 */
export async function searchPeople(query: string): Promise<PersonResult[]> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) return [];
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];

  const service = createServiceClient();
  const { data } = await service
    .from("employees")
    .select("id, full_name, employee_code, employment_status")
    .or(`full_name.ilike.%${q}%,employee_code.ilike.%${q}%,email.ilike.%${q}%`)
    .order("full_name")
    .limit(8);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: links } = await service
    .from("employee_roles")
    .select("employee_id, role_id")
    .in("employee_id", rows.map((row) => row.id));
  const roleIds = [...new Set((links ?? []).map((link) => link.role_id))];
  const { data: roles } = roleIds.length
    ? await service.from("roles").select("id, display_name").in("id", roleIds)
    : { data: [] as { id: string; display_name: string }[] };
  const roleName = new Map((roles ?? []).map((role) => [role.id, role.display_name]));
  const roleOf = new Map((links ?? []).map((link) => [link.employee_id, roleName.get(link.role_id)]));

  return rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    code: row.employee_code,
    role: roleOf.get(row.id) ?? (row.employment_status === "ACTIVE" ? "Employee" : row.employment_status.toLowerCase()),
    href: `/admin/employees/${row.id}`,
  }));
}
