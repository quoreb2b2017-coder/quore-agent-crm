import { HR_ROLE, type StaffRoleKey } from "@/lib/permissions/roles";

/** Stable role-group for an org department (name is editable separately). */
export const DEPARTMENT_KINDS = ["SALES", "MANAGEMENT", "HR"] as const;
export type DepartmentKind = (typeof DEPARTMENT_KINDS)[number];

export type AssignableRoleKey = StaffRoleKey | typeof HR_ROLE;

export const DEPARTMENT_KIND_OPTIONS: {
  kind: DepartmentKind;
  defaultName: string;
  /** Older display names we still map / rename from. */
  legacyNames: string[];
  roles: { roleKey: AssignableRoleKey; label: string }[];
}[] = [
  {
    kind: "SALES",
    defaultName: "Sales Operations",
    legacyNames: ["Sales", "Sales Operation", "Sales Ops"],
    roles: [{ roleKey: "AGENT", label: "Agent" }],
  },
  {
    kind: "MANAGEMENT",
    defaultName: "Executive and Operations",
    legacyNames: ["Management", "Executive & Operations", "Executive Operations"],
    roles: [
      { roleKey: "DATABASE", label: "Database Admin" },
      { roleKey: "EMAIL_MARKETING", label: "Email Marketing" },
    ],
  },
  {
    kind: "HR",
    defaultName: "Human Resources",
    legacyNames: ["HR", "Human Resource"],
    roles: [{ roleKey: HR_ROLE, label: "HR" }],
  },
];

export function isDepartmentKind(value: string): value is DepartmentKind {
  return (DEPARTMENT_KINDS as readonly string[]).includes(value);
}

export function rolesForDepartmentKind(kind: DepartmentKind | null | undefined) {
  if (!kind) return [];
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === kind)?.roles ?? [];
}

export function roleAllowedForKind(kind: DepartmentKind | null | undefined, roleKey: string) {
  return rolesForDepartmentKind(kind).some((role) => role.roleKey === roleKey);
}

/** Infer kind from display name when DB kind is missing or stale. */
export function inferDepartmentKindFromName(name: string): DepartmentKind | null {
  const normalized = name.trim().toLowerCase();
  if (
    normalized.includes("human resource") ||
    normalized === "hr" ||
    normalized.startsWith("hr ") ||
    normalized.endsWith(" hr")
  ) {
    return "HR";
  }
  if (
    normalized.includes("executive") ||
    normalized.includes("manage") ||
    normalized.includes("database") ||
    normalized.includes("email") ||
    normalized.includes("marketing")
  ) {
    return "MANAGEMENT";
  }
  if (normalized.includes("sale") || normalized.includes("agent")) {
    return "SALES";
  }
  return null;
}

export function effectiveDepartmentKind(department: {
  kind?: DepartmentKind | string | null;
  name: string;
}): DepartmentKind | null {
  if (department.kind && isDepartmentKind(department.kind)) return department.kind;
  return inferDepartmentKindFromName(department.name);
}

export function departmentKindLabel(kind: DepartmentKind) {
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === kind)?.defaultName ?? kind;
}

export function matchesDepartmentName(name: string, option: (typeof DEPARTMENT_KIND_OPTIONS)[number]) {
  const normalized = name.trim().toLowerCase();
  if (normalized === option.defaultName.toLowerCase()) return true;
  return option.legacyNames.some((legacy) => legacy.toLowerCase() === normalized);
}
