import { isStaffOrAdmin } from "./roles";

export type ModuleIconName =
  | "dashboard"
  | "users"
  | "building"
  | "shield"
  | "clock"
  | "radio"
  | "trending"
  | "globe"
  | "coffee"
  | "tasks"
  | "wallet"
  | "file"
  | "calendar"
  | "chart"
  | "alert"
  | "laptop"
  | "bell"
  | "history"
  | "book"
  | "settings"
  | "megaphone"
  | "users-round"
  | "map"
  | "user"
  | "key"
  | "message";

export type ModuleGroup =
  | "overview"
  | "people"
  | "operations"
  | "hr"
  | "account"
  | "work"
  | "time"
  | "insights";

export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  overview: "Overview",
  people: "People",
  operations: "Operations",
  hr: "HR & payroll",
  account: "Account",
  work: "My work",
  time: "Time",
  insights: "Insights",
};

export type ModuleDefinition = {
  key: string;
  label: string;
  href: string;
  icon: ModuleIconName;
  group: ModuleGroup;
  permission?: string | string[];
  rolesOnly?: string[];
};

function hasAny(
  permissions: string[],
  required: string | string[] | undefined
): boolean {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some((p) => permissions.includes(p));
}

export function filterModules(
  modules: ModuleDefinition[],
  ctx: { permissions: string[]; roleKey: string }
): ModuleDefinition[] {
  return modules.filter((m) => {
    if (m.rolesOnly && !m.rolesOnly.includes(ctx.roleKey)) return false;
    if (isStaffOrAdmin(ctx.roleKey)) return true;
    return hasAny(ctx.permissions, m.permission);
  });
}

export const ADMIN_MODULES: ModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: "dashboard", group: "overview" },
  { key: "chat", label: "Chat", href: "/admin/chat", icon: "message", group: "overview" },
  {
    key: "employees",
    label: "Employees",
    href: "/admin/employees",
    icon: "users",
    group: "operations",
    rolesOnly: ["SUPER_ADMIN"],
  },
  { key: "attendance", label: "Attendance", href: "/admin/attendance", icon: "clock", group: "operations" },
  { key: "productivity", label: "Productivity", href: "/admin/productivity", icon: "trending", group: "operations" },
  { key: "salary-slips", label: "Salary Slips", href: "/admin/salary-slips", icon: "file", group: "hr" },
  {
    key: "payroll",
    label: "Payroll",
    href: "/admin/payroll",
    icon: "wallet",
    group: "hr",
    rolesOnly: ["SUPER_ADMIN"],
  },
  { key: "leave", label: "Leave Management", href: "/admin/leave", icon: "calendar", group: "hr" },
  { key: "notifications", label: "Notifications", href: "/admin/notifications", icon: "bell", group: "account" },
  { key: "profile", label: "Profile", href: "/admin/settings", icon: "user", group: "account" },
  { key: "password", label: "Update password", href: "/admin/password", icon: "key", group: "account" },
];

export const EMPLOYEE_MODULES: ModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", href: "/portal/dashboard", icon: "dashboard", group: "overview" },
  { key: "chat", label: "Chat", href: "/portal/chat", icon: "message", group: "overview" },
  { key: "activity", label: "My Activity", href: "/portal/activity", icon: "radio", group: "work" },
  { key: "attendance", label: "Attendance", href: "/portal/attendance", icon: "clock", group: "time" },
  { key: "productivity", label: "Productivity", href: "/portal/productivity", icon: "trending", group: "time" },
  { key: "salary-slips", label: "Salary Slips", href: "/portal/salary-slips", icon: "wallet", group: "account" },
  { key: "leave", label: "Leave", href: "/portal/leave", icon: "calendar", group: "account" },
  { key: "notifications", label: "Notifications", href: "/portal/notifications", icon: "bell", group: "account" },
  { key: "profile", label: "Profile", href: "/portal/profile", icon: "user", group: "account" },
  { key: "password", label: "Update password", href: "/portal/password", icon: "key", group: "account" },
];
