import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { EXCEPTION_STATUS, humanize, shortDate } from "@/lib/compliance/labels";
import { RequestExceptionSheet } from "../compliance-forms";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const { manage } = await requireCompliance();
  const service = createServiceClient();
  const [{ data: rows }, { data: controls }, { data: people }] = await Promise.all([
    service.from("control_exceptions").select("*").order("created_at", { ascending: false }),
    service.from("compliance_controls").select("id, control_code, title").order("control_code"),
    service.from("employees").select("id, full_name"),
  ]);
  const code = new Map((controls ?? []).map((c) => [c.id, c.control_code]));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Panel
      id="exceptions"
      title={`Security exceptions · ${(rows ?? []).length}`}
      description="Approved deviations from a control, each with a compensating control and an expiry. Decide requests in Approvals."
      actions={manage ? <RequestExceptionSheet controls={(controls ?? []).map((c) => ({ id: c.id, label: `${c.control_code} · ${c.title}` }))} /> : undefined}
    >
      {(rows ?? []).length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No exceptions. Good.</p>
      ) : (
        <ul className="divide-y">
          {(rows ?? []).map((x) => {
            const expired = x.status === "APPROVED" && x.expires_at && x.expires_at < today;
            return (
              <li key={x.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{humanize(x.kind)}{x.control_id ? <span className="font-mono text-xs text-muted-foreground"> · {code.get(x.control_id)}</span> : null}</p>
                  <p className="text-sm">{x.description}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Compensating: {x.compensating_control ?? "—"} · requested by {x.requested_by ? name.get(x.requested_by) : "—"}
                    {x.approved_by ? ` · approved by ${name.get(x.approved_by)}` : ""} · expires {shortDate(x.expires_at)}
                  </p>
                </div>
                <Pill tone={expired ? "danger" : EXCEPTION_STATUS[x.status]?.tone}>{expired ? "Expired" : EXCEPTION_STATUS[x.status]?.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
