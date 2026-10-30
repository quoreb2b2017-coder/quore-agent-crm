/** Plain-language labels for audit log rows. */

const TABLE_LABELS: Record<string, string> = {
  employees: "employee record",
  employee_roles: "role assignment",
  role_permissions: "role permission",
  roles: "role",
  permissions: "permission",
  attendance: "attendance",
  salary_records: "salary",
  salary_slips: "salary slip",
  leave_requests: "leave request",
  work_policies: "work policy",
  meetings: "meeting",
  app_settings: "work settings",
  employee_onboarding: "onboarding record",
  onboarding_documents: "onboarding document",
  compliance_controls: "control",
  control_requirement_mappings: "control mapping",
  evidence_items: "evidence",
  control_tests: "control test",
  control_exceptions: "security exception",
  risks: "risk",
  soa_entries: "Statement of Applicability entry",
  corrective_actions: "corrective action",
  security_events: "security event",
};

export function tableLabel(table: string | null) {
  if (!table) return "record";
  return TABLE_LABELS[table] ?? table.replaceAll("_", " ");
}

const SECURITY_EVENTS: Record<string, string> = {
  SECURITY_MFA_RESET: "Reset two-factor sign-in",
};

export function describeAudit(action: string, table: string | null) {
  if (SECURITY_EVENTS[action]) return SECURITY_EVENTS[action];
  const op = action.split("_")[0];
  const verb = op === "INSERT" ? "Created" : op === "UPDATE" ? "Changed" : op === "DELETE" ? "Deleted" : action;
  return `${verb} ${tableLabel(table)}`;
}

/** Keys whose value changed between two audit snapshots (ignoring timestamps). */
export function changedKeys(oldData: unknown, newData: unknown): string[] {
  if (!oldData || !newData || typeof oldData !== "object" || typeof newData !== "object") return [];
  const a = oldData as Record<string, unknown>;
  const b = newData as Record<string, unknown>;
  return Object.keys(b)
    .filter((key) => !["updated_at", "version"].includes(key))
    .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}
