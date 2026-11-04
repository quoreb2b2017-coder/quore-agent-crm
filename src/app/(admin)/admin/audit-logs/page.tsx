import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { changedKeys, describeAudit } from "@/lib/audit/describe";
import { formatDateTime } from "@/lib/format";
import { VerifyChainButton } from "./verify-button";
import { AuditFilterBar } from "./filter-bar";

export const metadata = { title: "Audit log · WorkTrack" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = Promise<{ table?: string; person?: string; actor?: string; page?: string }>;

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

function employeeIdFromPayload(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).employee_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function relatedEmployeeId(row: AuditRow): string | null {
  if (row.table_name === "employees" && row.record_id) return row.record_id;
  return employeeIdFromPayload(row.new_data) ?? employeeIdFromPayload(row.old_data);
}

export default async function AuditLogPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  if (!isSuperAdmin(ctx.roleKey) && !ctx.permissions.includes("compliance.audit")) {
    redirect("/admin/dashboard");
  }
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const personId = (params.person || params.actor || "").trim();
  const service = createServiceClient();

  const chainSelect =
    "id, seq, action, table_name, record_id, actor_employee_id, actor_source, request_id, old_data, new_data, created_at, row_hash";
  const basicSelect =
    "id, action, table_name, record_id, actor_employee_id, old_data, new_data, created_at";

  let query = service
    .from("audit_logs")
    .select(chainSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (params.table) query = query.eq("table_name", params.table);
  // Person = who changed it OR whose record was touched (employees / employee_id in payload).
  if (personId) {
    query = query.or(
      [
        `actor_employee_id.eq.${personId}`,
        `record_id.eq.${personId}`,
        `new_data->>employee_id.eq.${personId}`,
        `old_data->>employee_id.eq.${personId}`,
      ].join(",")
    );
  }

  const { data: people } = await service
    .from("employees")
    .select("id, full_name, employee_code")
    .order("full_name");

  let rows: AuditRow[] | null = null;
  let count: number | null = null;
  let chainInstalled = true;
  {
    const primary = await query;
    if (
      primary.error &&
      /column .* does not exist|42703|seq|row_hash|actor_source|request_id/i.test(primary.error.message)
    ) {
      chainInstalled = false;
      let basic = service
        .from("audit_logs")
        .select(basicSelect, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (params.table) basic = basic.eq("table_name", params.table);
      if (personId) {
        basic = basic.or(
          [
            `actor_employee_id.eq.${personId}`,
            `record_id.eq.${personId}`,
            `new_data->>employee_id.eq.${personId}`,
            `old_data->>employee_id.eq.${personId}`,
          ].join(",")
        );
      }
      const fallback = await basic;
      if (fallback.error) throw new Error(fallback.error.message);
      rows = (fallback.data ?? []).map((row) => ({
        ...row,
        seq: null,
        actor_source: null,
        request_id: null,
        row_hash: null,
      }));
      count = fallback.count;
    } else if (primary.error) {
      throw new Error(primary.error.message);
    } else {
      rows = (primary.data ?? []) as AuditRow[];
      count = primary.count;
    }
  }

  const name = new Map((people ?? []).map((p) => [p.id, (p.full_name ?? "").trim() || "Unnamed"]));
  const tables = [
    "employees",
    "employee_roles",
    "employee_onboarding",
    "role_permissions",
    "roles",
    "permissions",
    "attendance",
    "salary_records",
    "salary_slips",
    "leave_requests",
    "meetings",
    "app_settings",
    "compliance_controls",
    "control_requirement_mappings",
    "evidence_items",
    "control_tests",
    "risks",
    "soa_entries",
    "corrective_actions",
    "control_exceptions",
  ];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    if (params.table) sp.set("table", params.table);
    if (personId) sp.set("person", personId);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  const hasFilters = Boolean(params.table || personId);

  const { count: unsealedCount } = chainInstalled
    ? await service
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .is("row_hash", null)
    : { count: 0 };

  const appendProbe = chainInstalled
    ? await service.rpc("append_audit_log", {
        p_table: "meetings",
        p_record_id: null,
        p_action: "BAD",
        p_old: null,
        p_new: null,
        p_actor: null,
      })
    : { error: null };
  // Missing RPC → need 0039. Existing RPC rejects BAD action without inserting.
  const needsCoverageSql =
    chainInstalled &&
    !!appendProbe.error &&
    /Could not find the function|schema cache|PGRST202/i.test(appendProbe.error.message);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        description="Every change to people, pay, access, settings and compliance records. Entries cannot be edited or deleted, and each is sealed into a SHA-256 hash chain. Verify integrity syncs from live Supabase data."
        actions={<VerifyChainButton />}
      />
      {!chainInstalled ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Hash chain is not installed yet. Run{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            supabase/migrations/0037_audit_chain_verify.sql
          </code>{" "}
          then{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            0038_seal_legacy_audit_logs.sql
          </code>{" "}
          and{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            0039_audit_triggers_complete.sql
          </code>{" "}
          in the Supabase SQL Editor.
        </p>
      ) : needsCoverageSql ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Some live tables (meetings, settings, …) are not fully wired into the audit log yet. Run{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            supabase/migrations/0039_audit_triggers_complete.sql
          </code>{" "}
          once in the Supabase SQL Editor, then click <span className="font-medium">Verify integrity</span> —
          after that, Verify keeps the log in sync with Supabase automatically.
        </p>
      ) : unsealedCount && unsealedCount > 0 ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {unsealedCount.toLocaleString("en-IN")} older entries are still unsealed. Open Supabase → SQL
          Editor, run{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            supabase/migrations/0038_seal_legacy_audit_logs.sql
          </code>
          , then click <span className="font-medium">Verify integrity</span>.
        </p>
      ) : null}
      <Panel
        id="log"
        title={`${total.toLocaleString("en-IN")} entries`}
        actions={
          <AuditFilterBar
            tables={tables}
            people={(people ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
            table={params.table}
            personId={personId}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  When
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Who
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  What
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Fields changed
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Seal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    {hasFilters
                      ? "No audit entries for this filter yet. Changes after logging was turned on will show up here."
                      : "No audit entries yet."}
                    {hasFilters ? (
                      <>
                        {" "}
                        <Link href="/admin/audit-logs" className="text-primary underline underline-offset-2">
                          Clear filters
                        </Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ) : (
                (rows ?? []).map((row) => {
                  const keys = changedKeys(row.old_data, row.new_data);
                  const relatedId = relatedEmployeeId(row);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-2.5 text-xs whitespace-nowrap">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {row.actor_employee_id ? (
                          name.get(row.actor_employee_id) ?? "Former employee"
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                        {row.actor_source ? (
                          <span className="block text-muted-foreground">
                            {row.actor_source.replaceAll("_", " ").toLowerCase()}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {describeAudit(row.action, row.table_name)}
                        {relatedId ? (
                          <Link
                            href={`/admin/employees/${relatedId}`}
                            className="block text-xs text-primary hover:underline"
                          >
                            {name.get(relatedId) ?? "Open record"}
                          </Link>
                        ) : null}
                      </td>
                      <td className="max-w-[22rem] px-3 py-2.5 text-xs text-muted-foreground">
                        {keys.length ? keys.join(", ").replaceAll("_", " ") : "—"}
                      </td>
                      <td className="px-5 py-2.5">
                        {row.row_hash ? (
                          <Pill tone="success" className="font-mono">
                            #{row.seq}
                          </Pill>
                        ) : (
                          <Pill tone="neutral">unsealed</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={qs(page - 1)}>Newer</Link>
                </Button>
              ) : null}
              {page < pages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={qs(page + 1)}>Older</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
