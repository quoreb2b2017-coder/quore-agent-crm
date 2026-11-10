export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";
export const HR_ROLE = "HR";

/**
 * Legacy seed roles kept in DB but hidden from admin role UI. Neither has screens of its own
 * (no team view, no field-visit pages), so nobody can be given one by mistake.
 */
export const HIDDEN_ROLE_KEYS = ["MANAGER", "FIELD_EMPLOYEE"] as const;

export function isHiddenRole(roleKey: string) {
  return (HIDDEN_ROLE_KEYS as readonly string[]).includes(roleKey);
}

/** Sees every employee and runs HR work. Not tracked on the shift clock. */
export const MANAGEMENT_ROLE_KEYS = [SUPER_ADMIN_ROLE, HR_ROLE] as const;

/** Staff roles that share the employee app (clock / portal). */
export const STAFF_ROLE_KEYS = ["AGENT", "DATABASE", "EMAIL_MARKETING", "IT", "OPS_MANAGER"] as const;

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLE_KEYS);

const ADMIN_SHELL_ROLES = new Set<string>([
  SUPER_ADMIN_ROLE,
  HR_ROLE,
  ...STAFF_ROLE_KEYS,
]);

/**
 * Permissions the shared staff roles (Agent / Database / Email Marketing) must
 * never receive implicitly. Before finding F-03 only the first two were listed,
 * so every staff member was treated as holding payroll, salary, role and
 * policy administration rights at the application layer.
 */
const SUPER_ADMIN_ONLY_PERMISSIONS = new Set([
  "employees.manage",
  "audit_logs.view",
  "roles.manage",
  "salary.view",
  "salary.manage",
  "payroll.manage",
  "policies.manage",
  "devices.manage",
  "compliance.view",
  "compliance.manage",
  "compliance.audit",
]);

/**
 * Only Super Admin and HR may hold these. The database refuses them for any other role
 * (migration 0046), and the WT-IAM-03 automated check uses the same list.
 */
export const RESTRICTED_STAFF_PERMISSIONS = new Set([
  "salary.view",
  "salary.manage",
  "payroll.manage",
  "attendance.manage",
  "activity.manage",
  "leave.approve",
  "policies.manage",
  "devices.manage",
  "employees.manage",
  "audit_logs.view",
  "compliance.manage",
]);

/** payroll.manage stays with Super Admin: HR sets salaries, so must not also run payroll (ISO A.5.3). */
const HR_BLOCKED_PERMISSIONS = new Set(["audit_logs.view", "payroll.manage"]);

export function isSuperAdmin(roleKey: string) {
  return roleKey === SUPER_ADMIN_ROLE;
}

export function isHr(roleKey: string) {
  return roleKey === HR_ROLE;
}

/** Super Admin or HR. */
export function isManagement(roleKey: string) {
  return isSuperAdmin(roleKey) || isHr(roleKey);
}

export function isStaffRole(roleKey: string) {
  return STAFF_ROLE_SET.has(roleKey);
}

export const STAFF_DEPARTMENTS: { roleKey: StaffRoleKey; label: string }[] = [
  { roleKey: "AGENT", label: "Agent" },
  { roleKey: "DATABASE", label: "Database" },
  { roleKey: "EMAIL_MARKETING", label: "Email Marketing" },
  { roleKey: "IT", label: "IT" },
  { roleKey: "OPS_MANAGER", label: "Operations Manager" },
];

export function staffDepartmentLabel(roleKey: string) {
  return STAFF_DEPARTMENTS.find((item) => item.roleKey === roleKey)?.label ?? roleKey;
}

/** Uses the admin console (shared modules), not the limited employee portal. */
export function isAdminLike(roleKey: string) {
  return ADMIN_SHELL_ROLES.has(roleKey);
}

export function isStaffOrAdmin(roleKey: string) {
  return isManagement(roleKey) || isStaffRole(roleKey);
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
  if (isHr(roleKey)) return !HR_BLOCKED_PERMISSIONS.has(permission);
  if (!isStaffOrAdmin(roleKey)) return false;
  if (SUPER_ADMIN_ONLY_PERMISSIONS.has(permission)) return false;
  return true;
}
