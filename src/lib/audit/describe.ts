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
  co_campaigns: "campaign",
  co_campaign_members: "campaign member",
  co_files: "campaign file",
  co_database_versions: "campaign database version",
  co_file_categories: "campaign file category",
};

/** Record types grouped the way people think about them, for the filter. */
export const AUDIT_AREAS: { name: string; tables: string[] }[] = [
  { name: "People", tables: ["employees", "employee_onboarding", "onboarding_documents"] },
  { name: "Access", tables: ["employee_roles", "role_permissions", "roles", "permissions"] },
  { name: "Time & leave", tables: ["attendance", "meetings", "leave_requests"] },
  { name: "Pay", tables: ["salary_records", "salary_slips"] },
  { name: "Settings", tables: ["app_settings", "work_policies"] },
  {
    name: "Compliance",
    tables: [
      "compliance_controls",
      "control_requirement_mappings",
      "evidence_items",
      "control_tests",
      "risks",
      "soa_entries",
      "corrective_actions",
      "control_exceptions",
    ],
  },
  { name: "Campaigns", tables: ["co_campaigns", "co_campaign_members", "co_files", "co_database_versions", "co_file_categories"] },
  { name: "Security", tables: ["security_events"] },
];

export const AUDIT_OPERATIONS = [
  { id: "INSERT", label: "Created" },
  { id: "UPDATE", label: "Changed" },
  { id: "DELETE", label: "Deleted" },
  { id: "SECURITY", label: "Security" },
];

export type AuditOperationTone = "success" | "info" | "danger" | "warning" | "neutral";

/** Short verb for the Action column, and its colour. */
export function auditOperation(action: string): { label: string; tone: AuditOperationTone } {
  const op = action.split("_")[0];
  if (op === "INSERT") return { label: "Created", tone: "success" };
  if (op === "UPDATE") return { label: "Changed", tone: "info" };
  if (op === "DELETE") return { label: "Deleted", tone: "danger" };
  if (op === "SECURITY") return { label: "Security", tone: "warning" };
  return { label: action, tone: "neutral" };
}

export function tableLabel(table: string | null) {
  if (!table) return "record";
  return TABLE_LABELS[table] ?? table.replaceAll("_", " ");
}

const SECURITY_EVENTS: Record<string, string> = {
  SECURITY_MFA_RESET: "Reset two-factor sign-in",
  SECURITY_CO_FILE_DOWNLOADED: "Downloaded a campaign file",
  SECURITY_CO_DOWNLOAD_DENIED: "Was refused a campaign file",
  SECURITY_CO_DOWNLOAD_RATE_LIMITED: "Hit the campaign download limit",
  SECURITY_CO_INVALID_ROWS_EXPORTED: "Exported a database's invalid rows",
  SECURITY_CO_FILE_ARCHIVED: "Archived a campaign file",
  SECURITY_CO_CAMPAIGN_SUBMIT: "Marked a campaign ready for its database",
  SECURITY_CO_CAMPAIGN_HOLD: "Put a campaign on hold",
  SECURITY_CO_CAMPAIGN_RESUME: "Resumed a campaign",
  SECURITY_CO_CAMPAIGN_ARCHIVE: "Archived a campaign",
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
