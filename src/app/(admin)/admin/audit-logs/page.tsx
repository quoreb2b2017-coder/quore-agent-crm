import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Button } from "@/components/ui/button";
import { auditOperation, changedKeys, describeAudit } from "@/lib/audit/describe";
import { auditFilterParams, auditLogQuery, parseAuditFilters, relatedEmployeeId } from "@/lib/audit/query";
import { addDaysIso, formatDateTime, todayIso } from "@/lib/format";
import { AuditTable, type AuditTableRow } from "./audit-table";
import { VerifyChainButton } from "./verify-button";
import { AuditFilterBar } from "./filter-bar";

export const metadata = { title: "Audit log · WorkTrack" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = Promise<{
  table?: string;
  person?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

type AuditRow = {
  id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  actor_employee_id: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
  seq: number | null;
  actor_source: string | null;
  request_id: string | null;
  row_hash: string | null;
};

const CHAIN_COLUMNS =
  "id, seq, action, table_name, record_id, actor_employee_id, actor_source, request_id, old_data, new_data, created_at, row_hash";
const BASIC_COLUMNS = "id, action, table_name, record_id, actor_employee_id, old_data, new_data, created_at";

function MigrationNote({ children }: { children: React.ReactNode }) {
  return <p className="border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">{children}</p>;
}

function Sql({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm bg-black/5 px-1.5 py-0.5 text-xs">{children}</code>;
}

export default async function AuditLogPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  if (!isSuperAdmin(ctx.roleKey) && !ctx.permissions.includes("compliance.audit")) {
    redirect("/admin/dashboard");
  }
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const filters = parseAuditFilters(params);
  const service = createServiceClient();
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = page * PAGE_SIZE - 1;
  const today = todayIso();
  const countSince = (date: string, operation?: string) => {
    let query = service
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${date}T00:00:00+05:30`);
    if (operation) query = query.like("action", `${operation}%`);
    return query;
  };

  const [primary, { data: people }, { count: todayCount }, { count: deletedCount }, unsealed, appendProbe] =
    await Promise.all([
      auditLogQuery(service, CHAIN_COLUMNS, filters).range(rangeFrom, rangeTo),
      service.from("employees").select("id, full_name, employee_code").order("full_name"),
      countSince(today),
      countSince(addDaysIso(today, -6), "DELETE"),
      service.from("audit_logs").select("id", { count: "exact", head: true }).is("row_hash", null),
      service.rpc("append_audit_log", {
        p_table: "meetings",
        p_record_id: null,
        p_action: "BAD",
        p_old: null,
        p_new: null,
        p_actor: null,
      }),
    ]);

  let rows: AuditRow[] = [];
  let count: number | null = null;
  let chainInstalled = true;
  if (
    primary.error &&
    /column .* does not exist|42703|seq|row_hash|actor_source|request_id/i.test(primary.error.message)
  ) {
    chainInstalled = false;
    const fallback = await auditLogQuery(service, BASIC_COLUMNS, filters).range(rangeFrom, rangeTo);
    if (fallback.error) throw new Error(fallback.error.message);
    rows = ((fallback.data ?? []) as unknown as Omit<AuditRow, "seq" | "actor_source" | "request_id" | "row_hash">[]).map(
      (row) => ({ ...row, seq: null, actor_source: null, request_id: null, row_hash: null })
    );
    count = fallback.count;
  } else if (primary.error) {
    throw new Error(primary.error.message);
  } else {
    rows = (primary.data ?? []) as unknown as AuditRow[];
    count = primary.count;
  }

  // Missing RPC → need 0039. Existing RPC rejects BAD action without inserting.
  const needsCoverageSql =
    chainInstalled &&
    !!appendProbe.error &&
    /Could not find the function|schema cache|PGRST202/i.test(appendProbe.error.message);
  const unsealedCount = chainInstalled ? (unsealed.count ?? 0) : 0;

  const name = new Map((people ?? []).map((p) => [p.id, (p.full_name ?? "").trim() || "Unnamed"]));
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const search = auditFilterParams(filters);
    search.set("page", String(target));
    return `?${search.toString()}`;
  };
  const hasFilters = Object.values(filters).some(Boolean);

  // The list carries labels only. Before and after values load when a row is opened.
  const tableRows: AuditTableRow[] = rows.map((row) => {
    const operation = auditOperation(row.action);
    const relatedId = relatedEmployeeId(row);
    return {
      id: row.id,
      seq: row.seq,
      when: formatDateTime(row.created_at),
      who: row.actor_employee_id ? (name.get(row.actor_employee_id) ?? "Former employee") : "System",
      whoId: row.actor_employee_id && name.has(row.actor_employee_id) ? row.actor_employee_id : null,
      source: row.actor_source?.replaceAll("_", " ").toLowerCase() ?? null,
      operation: operation.label,
      tone: operation.tone,
      what: describeAudit(row.action, row.table_name),
      employee: relatedId ? (name.get(relatedId) ?? null) : null,
      employeeId: relatedId && name.has(relatedId) ? relatedId : null,
      fields: changedKeys(row.old_data, row.new_data),
      sealed: Boolean(row.row_hash),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        description="Every change to people, pay, access, settings and compliance records. Entries cannot be edited or deleted, and each is sealed into a SHA-256 hash chain."
        actions={<VerifyChainButton />}
      />

      {!chainInstalled ? (
        <MigrationNote>
          Hash chain is not installed yet. Run <Sql>supabase/migrations/0037_audit_chain_verify.sql</Sql> then{" "}
          <Sql>0038_seal_legacy_audit_logs.sql</Sql> and <Sql>0039_audit_triggers_complete.sql</Sql> in the Supabase
          SQL Editor.
        </MigrationNote>
      ) : needsCoverageSql ? (
        <MigrationNote>
          Some live tables (meetings, settings, …) are not fully wired into the audit log yet. Run{" "}
          <Sql>supabase/migrations/0039_audit_triggers_complete.sql</Sql> once in the Supabase SQL Editor, then click
          Verify integrity. After that, Verify keeps the log in sync with Supabase automatically.
        </MigrationNote>
      ) : unsealedCount > 0 ? (
        <MigrationNote>
          {unsealedCount.toLocaleString("en-IN")} older entries are still unsealed. Open Supabase → SQL Editor, run{" "}
          <Sql>supabase/migrations/0038_seal_legacy_audit_logs.sql</Sql>, then click Verify integrity.
        </MigrationNote>
      ) : null}

      <div className="flex flex-col [&>*+*]:-mt-px">
        <AuditFilterBar
          people={(people ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
          filters={filters}
        />

        <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
          <SheetKpi
            label={hasFilters ? "Matching entries" : "All entries"}
            value={total.toLocaleString("en-IN")}
            hint={hasFilters ? "With these filters" : "Since logging began"}
          />
          <SheetKpi label="Today" value={(todayCount ?? 0).toLocaleString("en-IN")} valueClassName="text-info" hint="Across all records" />
          <SheetKpi
            label="Deleted, 7 days"
            value={(deletedCount ?? 0).toLocaleString("en-IN")}
            valueClassName={deletedCount ? "text-destructive" : undefined}
            hint="Worth a second look"
          />
          <SheetKpi
            label="Sealed"
            value={unsealedCount > 0 ? `${unsealedCount.toLocaleString("en-IN")} unsealed` : "All sealed"}
            valueClassName={unsealedCount > 0 ? "text-warning" : "text-success"}
            hint="Use Verify integrity to check the chain"
          />
        </dl>

        <section className="border bg-card">
          {tableRows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {hasFilters ? "No entries match these filters." : "No audit entries yet."}{" "}
              {hasFilters ? (
                <Link href="/admin/audit-logs" className="font-medium text-primary underline-offset-2 hover:underline">
                  Clear filters
                </Link>
              ) : null}
            </p>
          ) : (
            <AuditTable rows={tableRows} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
            <span>
              {total === 0
                ? "0 entries"
                : `Showing ${(rangeFrom + 1).toLocaleString("en-IN")}–${Math.min(rangeTo + 1, total).toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
              {" · Click a row to see before and after"}
            </span>
            {pages > 1 ? (
              <span className="flex items-center gap-2">
                <span>
                  Page {page} of {pages}
                </span>
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm" className="h-7 rounded-sm bg-card">
                    <Link href={pageHref(page - 1)}>Newer</Link>
                  </Button>
                ) : null}
                {page < pages ? (
                  <Button asChild variant="outline" size="sm" className="h-7 rounded-sm bg-card">
                    <Link href={pageHref(page + 1)}>Older</Link>
                  </Button>
                ) : null}
              </span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
