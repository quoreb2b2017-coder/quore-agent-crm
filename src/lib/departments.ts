import { HR_ROLE, type StaffRoleKey } from "@/lib/permissions/roles";

/**
 * Default org departments (kind is stable; display name is editable).
 * Sales → Agent | Database → Database | Marketing → Email Marketing
 * Admin Control → HR | IT Field → IT
 */
export const DEPARTMENT_KINDS = [
  "ADMIN_CONTROL",
  "SALES",
  "MARKETING",
  "DATABASE",
  "IT",
] as const;
export type DepartmentKind = (typeof DEPARTMENT_KINDS)[number];

/** Built-in keys; custom roles use any UPPER_SNAKE string from the roles table. */
export type AssignableRoleKey = StaffRoleKey | typeof HR_ROLE | "IT" | (string & {});

export const DEPARTMENT_KIND_OPTIONS: {
  kind: DepartmentKind;
  typeLabel: string;
  defaultName: string;
  legacyNames: string[];
  roles: { roleKey: AssignableRoleKey; label: string }[];
}[] = [
  {
    kind: "ADMIN_CONTROL",
    typeLabel: "Admin",
    defaultName: "Admin Control",
    legacyNames: ["Admin", "Administration", "Human Resources", "HR", "Human Resource"],
    roles: [{ roleKey: HR_ROLE, label: "HR" }],
  },
  {
    kind: "SALES",
    typeLabel: "Agent",
    defaultName: "Sales",
    legacyNames: ["Sales Operations", "Sales Operation", "Sales Ops"],
    roles: [{ roleKey: "AGENT", label: "Agent" }],
  },
  {
    kind: "MARKETING",
    typeLabel: "Email Marketing",
    defaultName: "Marketing",
    legacyNames: ["Email Marketing", "Marketing Team"],
    roles: [{ roleKey: "EMAIL_MARKETING", label: "Email Marketing" }],
  },
  {
    kind: "DATABASE",
    typeLabel: "Database",
    defaultName: "Database",
    legacyNames: [
      "Executive and Operations",
      "Executive & Operations",
      "Executive Operations",
      "Management",
    ],
    roles: [{ roleKey: "DATABASE", label: "Database" }],
  },
  {
    kind: "IT",
    typeLabel: "IT",
    defaultName: "IT Field",
    legacyNames: ["IT", "IT Department", "Field IT"],
    roles: [{ roleKey: "IT", label: "IT" }],
  },
];

/** Flat role list for department create / assign pickers. */
export const DEPARTMENT_ROLE_OPTIONS: {
  roleKey: AssignableRoleKey;
  label: string;
  kind: DepartmentKind;
}[] = DEPARTMENT_KIND_OPTIONS.flatMap((item) =>
  item.roles.map((role) => ({
    roleKey: role.roleKey,
    label: role.label,
    kind: item.kind,
  }))
);

export function kindForAssignableRole(roleKey: string): DepartmentKind | null {
  return DEPARTMENT_ROLE_OPTIONS.find((role) => role.roleKey === roleKey)?.kind ?? null;
}

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
    normalized.includes("admin") ||
    normalized.includes("human resource") ||
    normalized === "hr" ||
    normalized.startsWith("hr ") ||
    normalized.endsWith(" hr")
  ) {
    return "ADMIN_CONTROL";
  }
  if (normalized.includes("market") || normalized.includes("email")) {
    return "MARKETING";
  }
  if (normalized.includes("database") || normalized.includes("data base")) {
    return "DATABASE";
  }
  if (
    normalized === "it" ||
    normalized.startsWith("it ") ||
    normalized.includes("it field") ||
    normalized.includes("field it")
  ) {
    return "IT";
  }
  if (normalized.includes("sale") || normalized.includes("agent")) {
    return "SALES";
  }
  // Old combined ops dept → Database by default (marketing is separate now).
  if (normalized.includes("executive") || normalized.includes("manage")) {
    return "DATABASE";
  }
  return null;
}

/** Map DB kind (incl. legacy HR / MANAGEMENT) → current DepartmentKind. */
export function normalizeDepartmentKind(
  kind: string | null | undefined,
  name?: string
): DepartmentKind | null {
  if (kind && isDepartmentKind(kind)) return kind;
  if (kind === "HR") return "ADMIN_CONTROL";
  if (kind === "MANAGEMENT") {
    if (name) {
      const fromName = inferDepartmentKindFromName(name);
      if (fromName === "MARKETING" || fromName === "DATABASE") return fromName;
    }
    return "DATABASE";
  }
  return name ? inferDepartmentKindFromName(name) : null;
}

export function effectiveDepartmentKind(department: {
  kind?: DepartmentKind | string | null;
  name: string;
}): DepartmentKind | null {
  return normalizeDepartmentKind(department.kind, department.name);
}

export function departmentKindLabel(kind: DepartmentKind) {
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === kind)?.defaultName ?? kind;
}

export function matchesDepartmentName(
  name: string,
  option: (typeof DEPARTMENT_KIND_OPTIONS)[number]
) {
  const normalized = name.trim().toLowerCase();
  if (normalized === option.defaultName.toLowerCase()) return true;
  return option.legacyNames.some((legacy) => legacy.toLowerCase() === normalized);
}
