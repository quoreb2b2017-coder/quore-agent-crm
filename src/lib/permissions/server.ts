import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readWorktrackJwtClaims, hasWorktrackProfileClaims } from "@/lib/auth/jwt-claims";
import type { EmployeeContext } from "./types";
import {
  isStaffOrAdmin,
  isStaffRole,
  isSuperAdmin,
  staffHasPermission,
  staffDepartmentLabel,
  SUPER_ADMIN_ROLE,
} from "./roles";
export { isAdminLike, isSuperAdmin } from "./roles";

const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

function roleDisplayNameLocal(roleKey: string) {
  if (roleKey === SUPER_ADMIN_ROLE) return "Super Admin";
  if (roleKey === "HR") return "HR";
  if (isStaffRole(roleKey)) return staffDepartmentLabel(roleKey);
  return roleKey.replaceAll("_", " ");
}

async function loadEmployeeContextFromDb(userId: string): Promise<EmployeeContext | null> {
  const service = createServiceClient();

  const { data: employee } = await service
    .from("employees")
    .select(
      "id, employee_code, full_name, email, profile_image_path, employment_status, employee_roles!inner(role_id, is_primary, roles(role_key, display_name))"
    )
    .eq("auth_user_id", userId)
    .eq("employee_roles.is_primary", true)
    .maybeSingle();

  if (!employee) return null;

  const assignment = Array.isArray(employee.employee_roles)
    ? employee.employee_roles[0]
    : employee.employee_roles;
  const roleRow = assignment?.roles;
  const role =
    roleRow && !Array.isArray(roleRow) ? roleRow : Array.isArray(roleRow) ? roleRow[0] : null;
  if (!assignment || !role) return null;

  let permissions: string[] = [];
  if (!isStaffOrAdmin(role.role_key)) {
    const { data: permRows } = await service
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", assignment.role_id);
    const permissionIds = (permRows ?? []).map((row) => row.permission_id);
    if (permissionIds.length > 0) {
      const { data: perms } = await service
        .from("permissions")
        .select("permission_key")
        .in("id", permissionIds);
      permissions = (perms ?? []).map((row) => row.permission_key);
    }
  }

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
 * Prefers JWT custom claims (Auth Hook). Falls back to a service-role
 * lookup by auth user id so Super Admin can sign in before the hook
 * is enabled in the Supabase dashboard.
 */
export const getCurrentEmployeeContext = cache(
  async (): Promise<EmployeeContext | null> => {
    const session = await getSession();
    const user = session?.user;
    if (!user) return null;

    const claims = readWorktrackJwtClaims(session.access_token);
    if (hasWorktrackProfileClaims(claims)) {
      return {
        employeeId: claims.employeeId!,
        employeeCode: claims.employeeCode!,
        fullName: claims.fullName!,
        email: user.email ?? "",
        profileImagePath: null,
        employmentStatus: claims.employmentStatus ?? "ACTIVE",
        roleKey: claims.roleKey!,
        roleDisplayName: claims.roleDisplayName!,
        permissions: claims.permissions ?? [],
      };
    }

    // Partial JWT claims: one employee row, no roles table scan.
    if (claims.employeeId && claims.roleKey) {
      const service = createServiceClient();
      const { data: employee } = await service
        .from("employees")
        .select("id, employee_code, full_name, email, profile_image_path, employment_status")
        .eq("id", claims.employeeId)
        .maybeSingle();

      if (employee) {
        return {
          employeeId: employee.id,
          employeeCode: employee.employee_code,
          fullName: employee.full_name,
          email: employee.email,
          profileImagePath: employee.profile_image_path,
          employmentStatus: claims.employmentStatus ?? employee.employment_status,
          roleKey: claims.roleKey,
          roleDisplayName: roleDisplayNameLocal(claims.roleKey),
          permissions: claims.permissions ?? [],
        };
      }
    }

    return loadEmployeeContextFromDb(user.id);
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
  return { ctx, seesAll: isSuperAdmin(ctx.roleKey) };
}

export async function requireSuperAdmin() {
  const { ctx, seesAll } = await requireViewer();
  if (!seesAll) redirect("/admin/dashboard");
  return ctx;
}
