import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { changedKeys, describeAudit, tableLabel } from "@/lib/audit/describe";
import { formatDateTime } from "@/lib/format";
import { VerifyChainButton } from "./verify-button";

export const metadata = { title: "Audit log · WorkTrack" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = Promise<{ table?: string; actor?: string; page?: string }>;

export default async function AuditLogPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  if (!isSuperAdmin(ctx.roleKey) && !ctx.permissions.includes("compliance.audit")) redirect("/admin/dashboard");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const service = createServiceClient();

  let query = service
    .from("audit_logs")
    .select("id, seq, action, table_name, record_id, actor_employee_id, actor_source, request_id, old_data, new_data, created_at, row_hash", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (params.table) query = query.eq("table_name", params.table);
  if (params.actor) query = query.eq("actor_employee_id", params.actor);

  const [{ data: rows, count }, { data: people }] = await Promise.all([
    query,
    service.from("employees").select("id, full_name, employee_code").order("full_name"),
  ]);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const tables = [
    "employees", "employee_roles", "role_permissions", "roles", "attendance", "salary_records", "salary_slips",
    "leave_requests", "meetings", "app_settings", "employee_onboarding", "compliance_controls", "evidence_items",
    "control_tests", "risks", "soa_entries", "corrective_actions", "control_exceptions",
  ];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    if (params.table) sp.set("table", params.table);
    if (params.actor) sp.set("actor", params.actor);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        description="Every change to people, pay, access, settings and compliance records. Entries cannot be edited or deleted, and each is sealed into a SHA-256 hash chain."
        actions={<VerifyChainButton />}
      />
      <Panel
        id="log"
        title={`${total.toLocaleString("en-IN")} entries`}
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <select name="table" defaultValue={params.table ?? ""} aria-label="Record type" className={`${NATIVE_SELECT_CLASS} h-9 w-48`}>
              <option value="">All record types</option>
              {tables.map((t) => (
                <option key={t} value={t}>{tableLabel(t)}</option>
              ))}
            </select>
            <select name="actor" defaultValue={params.actor ?? ""} aria-label="Changed by" className={`${NATIVE_SELECT_CLASS} h-9 w-48`}>
              <option value="">Anyone</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="h-9">Filter</Button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">When</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Who</th>
                <th scope="col" className="px-3 py-2.5 font-medium">What</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Fields changed</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Seal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(rows ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No entries match.</td></tr>
              ) : (
                (rows ?? []).map((row) => {
                  const keys = changedKeys(row.old_data, row.new_data);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-2.5 text-xs whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {row.actor_employee_id ? name.get(row.actor_employee_id) ?? "Former employee" : <span className="text-muted-foreground">System</span>}
                        {row.actor_source ? <span className="block text-muted-foreground">{row.actor_source.replaceAll("_", " ").toLowerCase()}</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {describeAudit(row.action, row.table_name)}
                        {row.table_name === "employees" && row.record_id ? (
                          <Link href={`/admin/employees/${row.record_id}`} className="block text-xs text-primary hover:underline">{name.get(row.record_id) ?? "Open record"}</Link>
                        ) : null}
                      </td>
                      <td className="max-w-[22rem] px-3 py-2.5 text-xs text-muted-foreground">{keys.length ? keys.join(", ").replaceAll("_", " ") : "—"}</td>
                      <td className="px-5 py-2.5">
                        {row.row_hash ? <Pill tone="success" className="font-mono">#{row.seq}</Pill> : <Pill tone="neutral">before chain</Pill>}
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
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={qs(page - 1)}>Newer</Link></Button> : null}
              {page < pages ? <Button asChild variant="outline" size="sm"><Link href={qs(page + 1)}>Older</Link></Button> : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
