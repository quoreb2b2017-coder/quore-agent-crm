import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { auditOperation, changedKeys, describeAudit, tableLabel } from "@/lib/audit/describe";
import { auditLogQuery, parseAuditFilters, relatedEmployeeId } from "@/lib/audit/query";
import { formatDateTime } from "@/lib/format";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const MAX_ROWS = 10000;
const COLUMNS =
  "seq, action, table_name, record_id, actor_employee_id, actor_source, request_id, old_data, new_data, created_at, row_hash";

type Row = {
  seq: number | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  actor_employee_id: string | null;
  actor_source: string | null;
  request_id: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
  row_hash: string | null;
};

export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !(isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.audit"))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams));
  const service = createServiceClient();

  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await auditLogQuery(service, COLUMNS, filters).range(from, from + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const { data: people } = await service.from("employees").select("id, full_name");
  const name = new Map((people ?? []).map((person) => [person.id, person.full_name]));

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Audit log");
  sheet.columns = [
    { header: "Entry", key: "seq", width: 9 },
    { header: "When", key: "when", width: 32 },
    { header: "Who", key: "who", width: 24 },
    { header: "Source", key: "source", width: 14 },
    { header: "Action", key: "operation", width: 11 },
    { header: "Record type", key: "record", width: 26 },
    { header: "What happened", key: "what", width: 34 },
    { header: "Employee", key: "employee", width: 24 },
    { header: "Fields changed", key: "fields", width: 44 },
    { header: "Sealed", key: "sealed", width: 9 },
    { header: "Request ID", key: "requestId", width: 38 },
  ];
  for (const row of rows) {
    const related = relatedEmployeeId(row);
    sheet.addRow({
      seq: row.seq ?? "",
      when: formatDateTime(row.created_at),
      who: row.actor_employee_id ? (name.get(row.actor_employee_id) ?? "Former employee") : "System",
      source: row.actor_source?.replaceAll("_", " ").toLowerCase() ?? "",
      operation: auditOperation(row.action).label,
      record: tableLabel(row.table_name),
      what: describeAudit(row.action, row.table_name),
      employee: related ? (name.get(related) ?? "Former employee") : "",
      fields: changedKeys(row.old_data, row.new_data).join(", ").replaceAll("_", " "),
      sealed: row.row_hash ? "Yes" : "No",
      requestId: row.request_id ?? "",
    });
  }
  finishSheet(sheet);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
