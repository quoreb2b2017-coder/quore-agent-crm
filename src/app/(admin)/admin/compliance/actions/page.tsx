import Link from "next/link";
import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { ACTION_STATUS, SEVERITY_TONE, humanize, shortDate } from "@/lib/compliance/labels";
import { ActionSheet } from "../compliance-forms";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export default async function CorrectiveActionsPage() {
  const { manage } = await requireCompliance();
  const service = createServiceClient();
  const [{ data: actions }, { data: controls }, { data: people }, { data: evidence }] = await Promise.all([
    service.from("corrective_actions").select("*"),
    service.from("compliance_controls").select("id, control_code"),
    service.from("employees").select("id, full_name, employment_status").order("full_name"),
    service.from("evidence_items").select("id, control_id, title").eq("status", "ACCEPTED"),
  ]);
  const code = new Map((controls ?? []).map((c) => [c.id, c.control_code]));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const active = (people ?? []).filter((p) => p.employment_status === "ACTIVE").map((p) => ({ id: p.id, name: p.full_name }));
  const sorted = [...(actions ?? [])].sort(
    (a, b) =>
      Number(a.status === "CLOSED") - Number(b.status === "CLOSED") ||
      (SEVERITY_ORDER[a.severity ?? "LOW"] ?? 4) - (SEVERITY_ORDER[b.severity ?? "LOW"] ?? 4) ||
      a.ref.localeCompare(b.ref)
  );

  return (
    <Panel id="actions" title={`Corrective actions · ${sorted.length}`} description="From the security assessment, control tests and audits. Close an action only with accepted evidence of the fix.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Severity</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Control</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Due</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Update</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((a) => {
              const overdue = a.due_date && a.status !== "CLOSED" && a.due_date < new Date().toISOString().slice(0, 10);
              return (
                <tr key={a.id} className="align-top">
                  <td className="max-w-[26rem] px-5 py-3">
                    <p className="font-medium"><span className="font-mono text-xs text-muted-foreground">{a.ref}</span> {a.title}</p>
                    <p className="text-xs text-muted-foreground">{humanize(a.source_type)}{a.source_ref ? ` · ${a.source_ref}` : ""}</p>
                  </td>
                  <td className="px-3 py-3">{a.severity ? <Pill tone={SEVERITY_TONE[a.severity]}>{a.severity.toLowerCase()}</Pill> : "—"}</td>
                  <td className="px-3 py-3">
                    {a.control_id ? <Link href={`/admin/compliance/controls/${a.control_id}`} className="font-mono text-xs text-primary hover:underline">{code.get(a.control_id)}</Link> : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs">{a.owner_employee_id ? name.get(a.owner_employee_id) : <span className="text-[#b54708]">Not assigned</span>}</td>
                  <td className={`px-3 py-3 text-xs ${overdue ? "font-medium text-destructive" : ""}`}>{a.due_date ? shortDate(a.due_date) : "Not set"}{overdue ? " · overdue" : ""}</td>
                  <td className="px-3 py-3"><Pill tone={ACTION_STATUS[a.status]?.tone}>{ACTION_STATUS[a.status]?.label}</Pill></td>
                  <td className="px-5 py-3 text-right">
                    {manage && a.status !== "RISK_ACCEPTED" ? (
                      <ActionSheet
                        action={a}
                        people={active}
                        evidence={(evidence ?? []).filter((e) => !a.control_id || e.control_id === a.control_id).map((e) => ({ id: e.id, title: e.title }))}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
