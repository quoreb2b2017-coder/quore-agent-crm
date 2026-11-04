import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEPARTMENT_KIND_OPTIONS,
  kindForAssignableRole,
  normalizeDepartmentKind,
  type DepartmentKind,
} from "@/lib/departments";
import { isHiddenRole, SUPER_ADMIN_ROLE } from "@/lib/permissions/roles";

export type AssignableDepartmentRole = {
  roleKey: string;
  label: string;
  kind: DepartmentKind;
  description: string | null;
};

function resolveKind(
  roleKey: string,
  departmentKind: string | null | undefined
): DepartmentKind | null {
  const normalized = normalizeDepartmentKind(departmentKind);
  if (normalized) {
    // MANAGEMENT was shared by Database + Email Marketing before the split.
    if (departmentKind === "MANAGEMENT" && roleKey === "EMAIL_MARKETING") {
      return "MARKETING";
    }
    return normalized;
  }
  return kindForAssignableRole(roleKey);
}

/** Roles that can be assigned under a department (excludes Super Admin / hidden). */
export async function loadAssignableDepartmentRoles(): Promise<AssignableDepartmentRole[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("roles")
    .select("role_key, display_name, description, department_kind, is_system")
    .order("display_name");

  if (error) throw new Error(error.message);

  const byKey = new Map<string, AssignableDepartmentRole>();

  for (const row of data ?? []) {
    if (row.role_key === SUPER_ADMIN_ROLE || isHiddenRole(row.role_key)) continue;
    const kind = resolveKind(row.role_key, row.department_kind);
    if (!kind) continue;
    byKey.set(row.role_key, {
      roleKey: row.role_key,
      label: row.display_name,
      kind,
      description: row.description,
    });
  }

  // Always include built-in department roles (HR under Admin Control, Agent under Sales, …)
  // so Teams never shows an empty role even if DB department_kind is stale.
  for (const item of DEPARTMENT_KIND_OPTIONS) {
    for (const role of item.roles) {
      if (byKey.has(role.roleKey)) {
        const existing = byKey.get(role.roleKey)!;
        if (existing.kind !== item.kind) {
          byKey.set(role.roleKey, { ...existing, kind: item.kind });
        }
        continue;
      }
      byKey.set(role.roleKey, {
        roleKey: role.roleKey,
        label: role.label,
        kind: item.kind,
        description: null,
      });
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)
  );
}

export function rolesForKind(
  roles: AssignableDepartmentRole[],
  kind: DepartmentKind | null | undefined
) {
  if (!kind) return [];
  return roles.filter((role) => role.kind === kind);
}
