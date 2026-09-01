export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

/** The three employee types that share the same app. */
export const STAFF_ROLE_KEYS = ["AGENT", "DATABASE", "EMAIL_MARKETING"] as const;

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLE_KEYS);

const ADMIN_SHELL_ROLES = new Set<string>([
  SUPER_ADMIN_ROLE,
  "HR",
  ...STAFF_ROLE_KEYS,
]);

const SUPER_ADMIN_ONLY_PERMISSIONS = new Set([
  "employees.manage",
  "audit_logs.view",
]);

export function isSuperAdmin(roleKey: string) {
  return roleKey === SUPER_ADMIN_ROLE;
}

export function isStaffRole(roleKey: string) {
  return STAFF_ROLE_SET.has(roleKey);
}

export const STAFF_DEPARTMENTS: { roleKey: StaffRoleKey; label: string }[] = [
  { roleKey: "AGENT", label: "Agent" },
  { roleKey: "DATABASE", label: "Database Admin" },
  { roleKey: "EMAIL_MARKETING", label: "Email Marketing" },
];

export function staffDepartmentLabel(roleKey: string) {
  return STAFF_DEPARTMENTS.find((item) => item.roleKey === roleKey)?.label ?? roleKey;
}

/** Uses the admin console (shared modules), not the limited employee portal. */
export function isAdminLike(roleKey: string) {
  return ADMIN_SHELL_ROLES.has(roleKey);
}

export function isStaffOrAdmin(roleKey: string) {
  return isSuperAdmin(roleKey) || isStaffRole(roleKey);
}

export function assignableRoles<T extends { id?: string; role_key: string }>(
  roles: T[],
  currentRoleKey?: string,
  currentRoleId?: string
): T[] {
  return roles.filter((role) => {
    if (STAFF_ROLE_SET.has(role.role_key)) return true;
    if (currentRoleId && role.id === currentRoleId) return true;
    return isSuperAdmin(currentRoleKey ?? "") && role.role_key === SUPER_ADMIN_ROLE;
  });
}

export function staffHasPermission(roleKey: string, permission: string) {
  if (isSuperAdmin(roleKey)) return true;
  if (!isStaffOrAdmin(roleKey)) return false;
  if (SUPER_ADMIN_ONLY_PERMISSIONS.has(permission)) return false;
  return true;
}
