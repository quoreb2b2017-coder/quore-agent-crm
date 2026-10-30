import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { RISK_STATUS, humanize, shortDate } from "@/lib/compliance/labels";
import { RiskSheet, type RiskRow } from "../compliance-forms";

export const dynamic = "force-dynamic";

function scoreTone(score: number | null) {
  if (score == null) return "neutral" as const;
  if (score >= 15) return "danger" as const;
  if (score >= 8) return "warning" as const;
  return "success" as const;
}

export default async function RisksPage() {
  const { manage } = await requireCompliance();
  const service = createServiceClient();
  const [{ data: risks }, { data: links }, { data: controls }, { data: people }] = await Promise.all([
    service.from("risks").select("*").order("risk_code"),
    service.from("risk_control_links").select("risk_id, control_id"),
    service.from("compliance_controls").select("id, control_code, title").order("control_code"),
    service.from("employees").select("id, full_name, employment_status").order("full_name"),
  ]);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const active = (people ?? []).filter((p) => p.employment_status === "ACTIVE").map((p) => ({ id: p.id, name: p.full_name }));
  const controlOptions = (controls ?? []).map((c) => ({ id: c.id, label: `${c.control_code} · ${c.title}` }));
  const code = new Map((controls ?? []).map((c) => [c.id, c.control_code]));

  return (
    <Panel
      id="risks"
      title={`Risk register · ${(risks ?? []).length}`}
      description="Scores are likelihood × impact (1–25). 15 or more is high, 8 to 14 is medium. The scale and appetite should match your approved risk method."
      actions={manage ? <RiskSheet people={active} controls={controlOptions} /> : undefined}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Risk</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Inherent</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Residual</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Treatment</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(risks ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No risks recorded yet. Add the first one from your risk assessment.</td></tr>
            ) : (
              (risks ?? []).map((r) => {
                const controlIds = (links ?? []).filter((l) => l.risk_id === r.id).map((l) => l.control_id);
                const row: RiskRow = { ...r, control_ids: controlIds };
                return (
                  <tr key={r.id} className="align-top">
                    <td className="max-w-[24rem] px-5 py-3">
                      <p className="font-medium"><span className="font-mono text-xs text-muted-foreground">{r.risk_code}</span> {r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.asset, [r.impacts_confidentiality && "C", r.impacts_integrity && "I", r.impacts_availability && "A"].filter(Boolean).join("")].filter(Boolean).join(" · ") || "—"}
                        {controlIds.length ? ` · ${controlIds.map((id) => code.get(id)).join(", ")}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3"><Pill tone={scoreTone(r.inherent_score)}>{r.inherent_score ?? "—"}</Pill></td>
                    <td className="px-3 py-3"><Pill tone={scoreTone(r.residual_score)}>{r.residual_score ?? "—"}</Pill></td>
                    <td className="px-3 py-3 text-xs">{humanize(r.treatment)}{r.due_date ? <span className="block text-muted-foreground">due {shortDate(r.due_date)}</span> : null}</td>
                    <td className="px-3 py-3 text-xs">{r.owner_employee_id ? name.get(r.owner_employee_id) : <span className="text-[#b54708]">Not assigned</span>}</td>
                    <td className="px-3 py-3"><Pill tone={RISK_STATUS[r.status]?.tone}>{RISK_STATUS[r.status]?.label}</Pill></td>
                    <td className="px-5 py-3 text-right">{manage ? <RiskSheet risk={row} people={active} controls={controlOptions} /> : null}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
