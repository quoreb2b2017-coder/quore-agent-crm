import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isEmploymentBlocked } from "@/lib/format";
import type { EmployeeContext } from "./types";
import { isManagement, isSuperAdmin, staffHasPermission } from "./roles";
export { isAdminLike, isManagement, isSuperAdmin } from "./roles";

async function loadEmployeeContextFromDb(userId: string): Promise<EmployeeContext | null> {
  const service = createServiceClient();

  // One round-trip: employee -> primary role -> role permissions -> permission keys.
  // (Previously three sequential queries; this runs on every server render and
  // every presence heartbeat.)
  const { data: employee } = await service
    .from("employees")
    .select(
      "id, employee_code, full_name, email, profile_image_path, employment_status, employee_roles!employee_roles_employee_id_fkey!inner(role_id, is_primary, roles(role_key, display_name, role_permissions(permissions(permission_key))))"
    )
    .eq("auth_user_id", userId)
    .eq("employee_roles.is_primary", true)
    .maybeSingle();

  if (!employee) return null;

  type PermissionLink = { permissions: { permission_key: string } | { permission_key: string }[] | null };
  type RoleRow = { role_key: string; display_name: string; role_permissions?: PermissionLink[] | null };
  const assignment = (Array.isArray(employee.employee_roles)
    ? employee.employee_roles[0]
    : employee.employee_roles) as unknown as { role_id: string; roles: RoleRow | RoleRow[] | null } | undefined;
  const roleRow = assignment?.roles;
  const role = roleRow && !Array.isArray(roleRow) ? roleRow : Array.isArray(roleRow) ? roleRow[0] : null;
  if (!assignment || !role) return null;

  const permissions = (role.role_permissions ?? [])
    .flatMap((link) => (Array.isArray(link.permissions) ? link.permissions : link.permissions ? [link.permissions] : []))
    .map((perm) => perm.permission_key);

  return {
    employeeId: employee.id,
    employeeCode: employee.employee_code,
    fullName: employee.full_name,
    email: employee.email,
    profileImagePath: employee.profile_image_path,
    employmentStatus: employee.employment_status,
    roleKey: role.role_key,
    roleDisplayName: role.display_name,
    permissions,
  };
}

/**
 * Resolves the signed-in employee's identity + role + permissions.
 *
 * Identity comes from a VERIFIED access token (getAuthUser -> getClaims).
 * Role, permissions and employment status are then read live from the
 * database rather than from JWT custom claims, so a role change, block or
 * termination takes effect on the next request instead of when the token
 * expires (findings F-01 and F-06). Cached per request.
 *
 * Includes SUSPENDED / TERMINATED employees so layouts can render the
 * blocked-account gate. Server actions and route handlers must use
 * getCurrentEmployeeContext(), which returns null for blocked employees.
 */
export const getEmployeeContextIncludingBlocked = cache(
  async (): Promise<EmployeeContext | null> => {
    const user = await getAuthUser();
    if (!user) return null;
    return loadEmployeeContextFromDb(user.id);
  }
);

/**
 * Signed-in, verified, ACTIVE (or ON_LEAVE) employee, or null.
 * Use this for every authorization decision.
 */
export const getCurrentEmployeeContext = cache(
  async (): Promise<EmployeeContext | null> => {
    const ctx = await getEmployeeContextIncludingBlocked();
    if (!ctx || isEmploymentBlocked(ctx.employmentStatus)) return null;
    return ctx;
  }
);

export function hasPermission(
  ctx: Pick<EmployeeContext, "permissions" | "roleKey">,
  permission: string
): boolean {
  if (staffHasPermission(ctx.roleKey, permission)) return true;
  return ctx.permissions.includes(permission);
}

export function hasAnyPermission(
  ctx: Pick<EmployeeContext, "permissions" | "roleKey">,
  permissions: string[]
): boolean {
  return permissions.some((permission) => hasPermission(ctx, permission));
}

export async function requireViewer() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  return { ctx, seesAll: isManagement(ctx.roleKey) };
}

export async function requireSuperAdmin() {
  const { ctx } = await requireViewer();
  if (!isSuperAdmin(ctx.roleKey)) redirect("/admin/dashboard");
  return ctx;
}

/** Super Admin or HR. */
export async function requireManagement() {
  const { ctx, seesAll } = await requireViewer();
  if (!seesAll) redirect("/admin/dashboard");
  return ctx;
}
