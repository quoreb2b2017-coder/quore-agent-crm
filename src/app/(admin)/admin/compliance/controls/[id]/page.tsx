import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { ACTION_STATUS, CONTROL_STATUS, EVIDENCE_STATUS, SEVERITY_TONE, humanize, shortDate } from "@/lib/compliance/labels";
import { isUuid } from "@/lib/attendance-period";
import { AddEvidenceSheet, EditControlSheet, EvidenceDownloadButton, RecordTestSheet } from "../../compliance-forms";

export const dynamic = "force-dynamic";

export default async function ControlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { manage } = await requireCompliance();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const service = createServiceClient();
  const { data: control } = await service.from("compliance_controls").select("*").eq("id", id).maybeSingle();
  if (!control) notFound();

  const [mapsRes, evidenceRes, testsRes, actionsRes, linksRes, peopleRes] = await Promise.all([
    service.from("control_requirement_mappings").select("requirement_id").eq("control_id", id),
    service.from("evidence_items").select("*").eq("control_id", id).order("collected_at", { ascending: false }),
    service.from("control_tests").select("*").eq("control_id", id).order("executed_at", { ascending: false }).limit(25),
    service.from("corrective_actions").select("id, ref, title, severity, status, due_date").eq("control_id", id).order("ref"),
    service.from("risk_control_links").select("risk_id").eq("control_id", id),
    service.from("employees").select("id, full_name, employment_status").order("full_name"),
  ]);
  const reqIds = (mapsRes.data ?? []).map((m) => m.requirement_id);
  const [{ data: reqs }, { data: fws }, { data: risks }] = await Promise.all([
    reqIds.length ? service.from("framework_requirements").select("id, ref, title, framework_id").in("id", reqIds) : Promise.resolve({ data: [] as { id: string; ref: string; title: string; framework_id: string }[] }),
    service.from("compliance_frameworks").select("id, name"),
    (linksRes.data ?? []).length
      ? service.from("risks").select("id, risk_code, title, status, residual_score, inherent_score").in("id", (linksRes.data ?? []).map((l) => l.risk_id))
      : Promise.resolve({ data: [] as { id: string; risk_code: string; title: string; status: string; residual_score: number | null; inherent_score: number | null }[] }),
  ]);
  const fwName = new Map((fws ?? []).map((f) => [f.id, f.name]));
  const people = (peopleRes.data ?? []).filter((p) => p.employment_status === "ACTIVE").map((p) => ({ id: p.id, name: p.full_name }));
  const name = new Map((peopleRes.data ?? []).map((p) => [p.id, p.full_name]));
  const status = CONTROL_STATUS[control.status as keyof typeof CONTROL_STATUS];
  const evidence = evidenceRes.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/admin/compliance/controls" className="text-primary hover:underline">Controls</Link> / {control.control_code}
      </nav>

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="max-w-3xl min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{control.control_code}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
            {control.priority ? <Pill tone={control.priority === "P0" ? "danger" : control.priority === "P1" ? "warning" : "neutral"}>{control.priority}</Pill> : null}
          </div>
          <h2 className="mt-1.5 text-xl font-semibold">{control.title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{control.description}</p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {control.domain} · {humanize(control.control_type)} · {humanize(control.execution_mode)} · {humanize(control.frequency)} ·
            Owner: {control.owner_employee_id ? name.get(control.owner_employee_id) : control.owner_role ? `${control.owner_role} (no person assigned)` : "not assigned"}
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            <EditControlSheet control={control} people={people} />
            <RecordTestSheet controlId={control.id} evidence={evidence.filter((e) => e.status === "ACCEPTED" || e.status === "PENDING_REVIEW").map((e) => ({ id: e.id, title: e.title }))} />
            <AddEvidenceSheet controlId={control.id} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel id="evidence" title={`Evidence · ${evidence.length}`} description="Accepted evidence from the last 12 months is needed for Operating.">
            {evidence.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No evidence yet.</p>
            ) : (
              <ul className="divide-y">
                {evidence.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {humanize(e.evidence_type)} from {e.source_system}
                        {e.source_record_id ? ` · ${e.source_record_id}` : ""} · collected {shortDate(e.collected_at)} by {e.collected_by ? name.get(e.collected_by) : "automation"}
                      </p>
                      {e.sha256 ? <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">sha256 {e.sha256}</p> : null}
                      {e.review_note ? <p className="mt-1 text-[12.5px]">Review: {e.review_note}{e.reviewed_by ? ` — ${name.get(e.reviewed_by)}` : ""}</p> : null}
                    </div>
                    <Pill tone={EVIDENCE_STATUS[e.status]?.tone ?? "neutral"}>{EVIDENCE_STATUS[e.status]?.label ?? e.status}</Pill>
                    {e.storage_path ? <EvidenceDownloadButton id={e.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="tests" title={`Tests · ${(testsRes.data ?? []).length}`} description="Append-only. Independent means the tester is not the control owner.">
            {(testsRes.data ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">This control has never been tested.</p>
            ) : (
              <ul className="divide-y">
                {(testsRes.data ?? []).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <Pill tone={t.result === "PASS" ? "success" : t.result === "PARTIAL" ? "warning" : "danger"}>{t.result.toLowerCase()}</Pill>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>{t.notes ?? humanize(t.method)}</p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {humanize(t.method)} · {shortDate(t.executed_at)} · {t.execution_identity}
                        {t.is_independent ? " · independent" : ""}
                        {t.exceptions_count ? ` · ${t.exceptions_count} exception${t.exceptions_count === 1 ? "" : "s"}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel id="state" title="Current state and gap">
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div>
                <dt className="text-[12.5px] text-muted-foreground">Current state</dt>
                <dd className="mt-0.5 whitespace-pre-line">{control.current_state ?? "Not described"}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted-foreground">Gap and remediation</dt>
                <dd className="mt-0.5 whitespace-pre-line">{control.gap_remediation ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted-foreground">Evidence needed</dt>
                <dd className="mt-0.5 whitespace-pre-line">{control.evidence_required ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted-foreground">How to test</dt>
                <dd className="mt-0.5 whitespace-pre-line">{control.test_procedure ?? "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel id="maps" title="Framework mapping">
            <ul className="divide-y">
              {(reqs ?? []).sort((a, b) => a.ref.localeCompare(b.ref)).map((r) => (
                <li key={r.id} className="px-5 py-2.5 text-sm">
                  <span className="font-mono text-[12.5px]">{r.ref}</span> {r.title}
                  <span className="block text-[12px] text-muted-foreground">{fwName.get(r.framework_id)}</span>
                </li>
              ))}
              {(reqs ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-muted-foreground">Not mapped yet.</li> : null}
            </ul>
          </Panel>

          <Panel id="related" title="Corrective actions and risks">
            <ul className="divide-y">
              {(actionsRes.data ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                  <span className="font-mono text-[12.5px] text-muted-foreground">{a.ref}</span>
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  {a.severity ? <Pill tone={SEVERITY_TONE[a.severity]}>{a.severity.toLowerCase()}</Pill> : null}
                  <Pill tone={ACTION_STATUS[a.status]?.tone ?? "neutral"}>{ACTION_STATUS[a.status]?.label ?? a.status}</Pill>
                </li>
              ))}
              {(risks ?? []).map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                  <span className="font-mono text-[12.5px] text-muted-foreground">{r.risk_code}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <Pill tone="neutral">score {r.residual_score ?? r.inherent_score ?? "—"}</Pill>
                </li>
              ))}
              {(actionsRes.data ?? []).length + (risks ?? []).length === 0 ? (
                <li className="px-5 py-4 text-sm text-muted-foreground">None linked.</li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
