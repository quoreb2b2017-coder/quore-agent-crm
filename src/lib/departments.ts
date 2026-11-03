import { HR_ROLE, type StaffRoleKey } from "@/lib/permissions/roles";

/** Stable role-group for an org department (name is editable separately). */
export const DEPARTMENT_KINDS = ["SALES", "MANAGEMENT", "HR"] as const;
export type DepartmentKind = (typeof DEPARTMENT_KINDS)[number];

export type AssignableRoleKey = StaffRoleKey | typeof HR_ROLE;

export const DEPARTMENT_KIND_OPTIONS: {
  kind: DepartmentKind;
  defaultName: string;
  roles: { roleKey: AssignableRoleKey; label: string }[];
}[] = [
  {
    kind: "SALES",
    defaultName: "Sales",
    roles: [{ roleKey: "AGENT", label: "Agent" }],
  },
  {
    kind: "MANAGEMENT",
    defaultName: "Management",
    roles: [
      { roleKey: "DATABASE", label: "Database Admin" },
      { roleKey: "EMAIL_MARKETING", label: "Email Marketing" },
    ],
  },
  {
    kind: "HR",
    defaultName: "HR",
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

export function departmentKindLabel(kind: DepartmentKind) {
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === kind)?.defaultName ?? kind;
}
