import "server-only";
import { isUuid } from "@/lib/attendance-period";
import type { createServiceClient } from "@/lib/supabase/service";
import { AUDIT_AREAS, AUDIT_OPERATIONS } from "@/lib/audit/describe";

export type AuditFilters = {
  /** One table, or "area:<name>" for a whole group of tables. */
  record: string;
  person: string;
  operation: string;
  from: string;
  to: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything here comes from the URL, so only known values reach the query. */
export function parseAuditFilters(raw: {
  table?: string | null;
  person?: string | null;
  actor?: string | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
}): AuditFilters {
  const record = (raw.table ?? "").trim();
  const knownRecord =
    AUDIT_AREAS.some((area) => record === `area:${area.name}` || area.tables.includes(record));
  const person = (raw.person || raw.actor || "").trim();
  const operation = (raw.action ?? "").trim();
  const date = (value?: string | null) => (value && ISO_DATE.test(value) ? value : "");
  return {
    record: knownRecord ? record : "",
    person: isUuid(person) ? person : "",
    operation: AUDIT_OPERATIONS.some((item) => item.id === operation) ? operation : "",
    from: date(raw.from),
    to: date(raw.to),
  };
}

export function auditFilterParams(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.record) params.set("table", filters.record);
  if (filters.person) params.set("person", filters.person);
  if (filters.operation) params.set("action", filters.operation);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}

/** Shift dates are read in IST, like every other report. */
function istStart(date: string) {
  return `${date}T00:00:00+05:30`;
}

function istEnd(date: string) {
  return `${date}T23:59:59.999+05:30`;
}

/** Newest first, with the filters applied. Callers add their own range. */
export function auditLogQuery(
  service: ReturnType<typeof createServiceClient>,
  columns: string,
  filters: AuditFilters
) {
  let query = service
    .from("audit_logs")
    .select(columns as "*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters.record.startsWith("area:")) {
    const area = AUDIT_AREAS.find((item) => `area:${item.name}` === filters.record);
    query = query.in("table_name", area?.tables ?? []);
  } else if (filters.record) {
    query = query.eq("table_name", filters.record);
  }
  if (filters.operation) query = query.like("action", `${filters.operation}%`);
  if (filters.from) query = query.gte("created_at", istStart(filters.from));
  if (filters.to) query = query.lte("created_at", istEnd(filters.to));
  // Person = who changed it OR whose record was touched (employees / employee_id in payload).
  if (filters.person) {
    query = query.or(
      [
        `actor_employee_id.eq.${filters.person}`,
        `record_id.eq.${filters.person}`,
        `new_data->>employee_id.eq.${filters.person}`,
        `old_data->>employee_id.eq.${filters.person}`,
      ].join(",")
    );
  }
  return query;
}

function employeeIdFromPayload(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).employee_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function relatedEmployeeId(row: {
  table_name: string | null;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
}): string | null {
  if (row.table_name === "employees" && row.record_id) return row.record_id;
  return employeeIdFromPayload(row.new_data) ?? employeeIdFromPayload(row.old_data);
}
