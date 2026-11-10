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
  | "message"
  | "clipboard"
  | "inbox"
  | "fingerprint"
  | "scroll"
  | "lock"
  | "database"
  | "folder";

export type ModuleGroup =
  | "workspace"
  | "campaigns"
  | "people"
  | "payroll"
  | "governance"
  | "account"
  | "work"
  | "time";

export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  workspace: "Workspace",
  campaigns: "Campaign Operations",
  people: "People",
  payroll: "Payroll",
  governance: "Governance",
  account: "Account",
  work: "My work",
  time: "Time",
};

export const ADMIN_GROUP_ORDER: ModuleGroup[] = ["workspace", "campaigns", "people", "payroll", "governance", "account"];
export const EMPLOYEE_GROUP_ORDER: ModuleGroup[] = ["workspace", "work", "time", "account"];

export type ModuleDefinition = {
  key: string;
  label: string;
  href: string;
  icon: ModuleIconName;
  group: ModuleGroup;
  permission?: string | string[];
  rolesOnly?: string[];
  /** Shown only to holders of at least one of these permissions, whatever the role (Campaign Operations). */
  requires?: string[];
  /** Regular expression for the paths that highlight this item, when the default prefix match is wrong. */
  match?: string;
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
    if (m.requires && !hasAny(ctx.permissions, m.requires)) return false;
    if (isStaffOrAdmin(ctx.roleKey)) return true;
    return hasAny(ctx.permissions, m.permission);
  });
}

const MANAGEMENT = ["SUPER_ADMIN", "HR"];
const SUPER_ADMIN_ONLY = ["SUPER_ADMIN"];
const CAMPAIGN_VIEW = ["co.campaign.view"];

export const ADMIN_MODULES: ModuleDefinition[] = [
  { key: "dashboard", label: "Command center", href: "/admin/dashboard", icon: "dashboard", group: "workspace" },
  { key: "approvals", label: "Approvals", href: "/admin/approvals", icon: "inbox", group: "workspace", rolesOnly: MANAGEMENT },
  { key: "chat", label: "Chat", href: "/admin/chat", icon: "message", group: "workspace" },
  { key: "notifications", label: "Notifications", href: "/admin/notifications", icon: "bell", group: "workspace" },
  { key: "co-overview", label: "Overview", href: "/admin/campaigns", icon: "chart", group: "campaigns", requires: CAMPAIGN_VIEW, match: "^/admin/campaigns/?$" },
  { key: "co-campaigns", label: "All campaigns", href: "/admin/campaigns/all", icon: "megaphone", group: "campaigns", requires: CAMPAIGN_VIEW, match: "^/admin/campaigns/(all|new|[0-9a-f-]{36})(/|$)" },
  { key: "co-repository", label: "Database repository", href: "/admin/campaigns/repository", icon: "database", group: "campaigns", requires: ["co.database.upload", "co.database.approve", "co.database.download"] },
  { key: "co-documents", label: "Document repository", href: "/admin/campaigns/documents", icon: "folder", group: "campaigns", requires: CAMPAIGN_VIEW },
  { key: "employees", label: "Employees", href: "/admin/employees", icon: "users", group: "people", rolesOnly: MANAGEMENT },
  { key: "teams", label: "Teams", href: "/admin/teams", icon: "building", group: "people", rolesOnly: MANAGEMENT },
  { key: "onboarding", label: "Onboarding", href: "/admin/onboarding", icon: "clipboard", group: "people", rolesOnly: MANAGEMENT },
  { key: "attendance", label: "Attendance", href: "/admin/attendance", icon: "clock", group: "people" },
  { key: "activity", label: "Activity", href: "/admin/activity", icon: "radio", group: "people", rolesOnly: MANAGEMENT },
  { key: "productivity", label: "Productivity", href: "/admin/productivity", icon: "trending", group: "people" },
  { key: "leave", label: "Leave", href: "/admin/leave", icon: "calendar", group: "people" },
  { key: "payroll", label: "Payroll runs", href: "/admin/payroll", icon: "wallet", group: "payroll", rolesOnly: MANAGEMENT },
  { key: "salary-slips", label: "Salary slips", href: "/admin/salary-slips", icon: "file", group: "payroll" },
  { key: "compliance", label: "Security & Compliance", href: "/admin/compliance", icon: "shield", group: "governance", rolesOnly: SUPER_ADMIN_ONLY },
  { key: "roles", label: "Roles & permissions", href: "/admin/roles", icon: "key", group: "governance", rolesOnly: SUPER_ADMIN_ONLY },
  { key: "audit-log", label: "Audit log", href: "/admin/audit-logs", icon: "scroll", group: "governance", rolesOnly: SUPER_ADMIN_ONLY },
  { key: "work-settings", label: "Work settings", href: "/admin/work-settings", icon: "settings", group: "governance", rolesOnly: SUPER_ADMIN_ONLY },
  { key: "security", label: "Account security", href: "/admin/security", icon: "fingerprint", group: "account" },
  { key: "profile", label: "Profile", href: "/admin/settings", icon: "user", group: "account" },
  { key: "password", label: "Change password", href: "/admin/password", icon: "lock", group: "account" },
];

export const EMPLOYEE_MODULES: ModuleDefinition[] = [
  { key: "dashboard", label: "Home", href: "/portal/dashboard", icon: "dashboard", group: "workspace" },
  { key: "chat", label: "Chat", href: "/portal/chat", icon: "message", group: "workspace" },
  { key: "notifications", label: "Notifications", href: "/portal/notifications", icon: "bell", group: "workspace" },
  { key: "activity", label: "My activity", href: "/portal/activity", icon: "radio", group: "work" },
  { key: "attendance", label: "Attendance", href: "/portal/attendance", icon: "clock", group: "time" },
  { key: "productivity", label: "Productivity", href: "/portal/productivity", icon: "trending", group: "time" },
  { key: "leave", label: "Leave", href: "/portal/leave", icon: "calendar", group: "time" },
  { key: "salary-slips", label: "Salary slips", href: "/portal/salary-slips", icon: "wallet", group: "account" },
  { key: "security", label: "Account security", href: "/portal/security", icon: "fingerprint", group: "account" },
  { key: "profile", label: "Profile", href: "/portal/profile", icon: "user", group: "account" },
  { key: "password", label: "Change password", href: "/portal/password", icon: "lock", group: "account" },
];
