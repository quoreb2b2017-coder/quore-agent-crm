import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Live tables that must appear in audit_logs.
 * Touch (no-op UPDATE) fires DB triggers; remaining gaps use append_audit_log RPC.
 */
const COVERAGE: {
  table: string;
  idColumn?: string;
  touch: string;
  tableLevel?: boolean;
}[] = [
  { table: "employees", touch: "updated_at" },
  { table: "employee_roles", touch: "employee_id" },
  { table: "employee_onboarding", idColumn: "employee_id", touch: "status" },
  { table: "role_permissions", touch: "role_id" },
  { table: "roles", touch: "updated_at" },
  { table: "permissions", touch: "description" },
  { table: "attendance", touch: "updated_at" },
  { table: "salary_records", touch: "updated_at" },
  { table: "salary_slips", touch: "status" },
  { table: "leave_requests", touch: "updated_at" },
  { table: "meetings", touch: "updated_at" },
  { table: "app_settings", touch: "updated_at", tableLevel: true },
  { table: "compliance_controls", touch: "updated_at" },
  { table: "control_requirement_mappings", touch: "mapping_note" },
  { table: "soa_entries", touch: "updated_at" },
  { table: "corrective_actions", touch: "updated_at" },
];

export type SyncCoverageResult = {
  touched: number;
  byTable: Record<string, number>;
  errors: string[];
  needsTriggerSql?: boolean;
};

type Service = ReturnType<typeof createServiceClient>;

async function auditedRecordIds(service: Service, table: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await service
      .from("audit_logs")
      .select("record_id")
      .eq("table_name", table)
      .not("record_id", "is", null)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table} audit scan: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (row.record_id) ids.add(String(row.record_id));
    }
    if (data.length < page) break;
    from += page;
  }
  return ids;
}

async function tableHasAnyAudit(service: Service, table: string): Promise<boolean> {
  const { count, error } = await service
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("table_name", table);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function appendSnapshot(
  service: Service,
  table: string,
  recordId: string | null,
  row: Record<string, unknown>
): Promise<{ ok: boolean; needsSql?: boolean; error?: string }> {
  const { error } = await service.rpc("append_audit_log", {
    p_table: table,
    p_record_id: recordId,
    p_action: `UPDATE_${table}`,
    p_old: null,
    p_new: row,
    p_actor: null,
  });
  if (!error) return { ok: true };
  if (/Could not find the function|schema cache|PGRST202/i.test(error.message)) {
    return { ok: false, needsSql: true, error: error.message };
  }
  return { ok: false, error: error.message };
}

/**
 * Sync audit coverage from live Supabase rows. Idempotent.
 */
export async function syncAuditCoverageFromLiveData(): Promise<SyncCoverageResult> {
  const service = createServiceClient();
  const byTable: Record<string, number> = {};
  const errors: string[] = [];
  let touched = 0;
  let needsTriggerSql = false;

  for (const spec of COVERAGE) {
    const { table, idColumn = "id", touch, tableLevel } = spec;
    try {
      if (tableLevel && (await tableHasAnyAudit(service, table))) continue;

      let audited = tableLevel ? new Set<string>() : await auditedRecordIds(service, table);
      const pending: { id: string; rawId: string | number; row: Record<string, unknown> }[] = [];
      let from = 0;
      const page = 100;

      for (;;) {
        const { data, error } = await service.from(table).select("*").range(from, from + page - 1);
        if (error) {
          if (/does not exist|42P01|42703/i.test(error.message)) {
            errors.push(`${table}: skipped (${error.message})`);
            break;
          }
          throw new Error(error.message);
        }
        if (!data?.length) break;

        for (const row of data) {
          const rawId = (row as Record<string, unknown>)[idColumn];
          const id = rawId == null ? "" : String(rawId);
          if (!id || audited.has(id)) continue;
          pending.push({ id, rawId: rawId as string | number, row: row as Record<string, unknown> });
        }

        if (data.length < page) break;
        from += page;
      }

      if (!pending.length) continue;

      // Pass 1: fire triggers via no-op update.
      for (const item of pending) {
        const value = item.row[touch];
        const { error: updError } = await service
          .from(table)
          .update({ [touch]: value })
          .eq(idColumn, item.rawId);
        if (updError) errors.push(`${table}/${item.id}: ${updError.message}`);
      }

      // Re-scan what the triggers actually wrote.
      if (tableLevel) {
        if (await tableHasAnyAudit(service, table)) {
          byTable[table] = pending.length;
          touched += pending.length;
          continue;
        }
      } else {
        audited = await auditedRecordIds(service, table);
      }

      const stillMissing = tableLevel ? pending : pending.filter((p) => !audited.has(p.id));
      if (!stillMissing.length) {
        byTable[table] = pending.length;
        touched += pending.length;
        continue;
      }

      // Pass 2: append_audit_log RPC (needs migration 0039).
      let tableTouched = pending.length - stillMissing.length;
      for (const item of stillMissing) {
        const snap = await appendSnapshot(service, table, tableLevel ? null : item.id, item.row);
        if (snap.needsSql) {
          needsTriggerSql = true;
          errors.push(
            `Run supabase/migrations/0039_audit_triggers_complete.sql in the Supabase SQL Editor (covers ${table}).`
          );
          break;
        }
        if (!snap.ok) {
          errors.push(`${table}/${item.id}: ${snap.error ?? "append failed"}`);
          continue;
        }
        tableTouched++;
        touched++;
      }
      if (tableTouched) byTable[table] = (byTable[table] ?? 0) + tableTouched;
      if (needsTriggerSql) break;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    touched,
    byTable,
    errors: [...new Set(errors)].slice(0, 20),
    needsTriggerSql,
  };
}
