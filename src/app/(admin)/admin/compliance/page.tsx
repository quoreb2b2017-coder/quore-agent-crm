import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireCompliance } from "@/lib/compliance/access";
import { loadComplianceSummary } from "@/lib/compliance/summary";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill, SegmentBar } from "@/components/wt/panel";
import { shortDate } from "@/lib/compliance/labels";

export const dynamic = "force-dynamic";

export default async function ComplianceOverviewPage() {
  await requireCompliance();
  const service = createServiceClient();
  const [summary, domainsRes, frameworksRes, reqsRes, mapsRes] = await Promise.all([
    loadComplianceSummary(),
    service.from("compliance_controls").select("domain, status"),
    service.from("compliance_frameworks").select("id, framework_key, name, version"),
    service.from("framework_requirements").select("id, framework_id"),
    service.from("control_requirement_mappings").select("requirement_id"),
  ]);

  const domains = new Map<string, { total: number; operating: number; gaps: number }>();
  for (const row of domainsRes.data ?? []) {
    const entry = domains.get(row.domain) ?? { total: 0, operating: 0, gaps: 0 };
    entry.total += 1;
    if (row.status === "OPERATING_EVIDENCED") entry.operating += 1;
    if (["NOT_IMPLEMENTED", "REMEDIATION_REQUIRED", "EXCEPTION_IDENTIFIED"].includes(row.status)) entry.gaps += 1;
    domains.set(row.domain, entry);
  }
  const mapped = new Set((mapsRes.data ?? []).map((m) => m.requirement_id));
  const frameworks = (frameworksRes.data ?? []).map((f) => {
    const reqs = (reqsRes.data ?? []).filter((r) => r.framework_id === f.id);
    return { ...f, total: reqs.length, mapped: reqs.filter((r) => mapped.has(r.id)).length };
  });
  const readiness = summary.totalControls ? Math.round((summary.operating / summary.totalControls) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="ready-title" className="flex flex-col gap-4 rounded-xl bg-ink p-5 text-ink-foreground">
          <h2 id="ready-title" className="text-[15px] font-semibold text-white">Audit readiness</h2>
          <p className="flex items-baseline gap-2.5">
            <span className="text-[40px] leading-none font-semibold tracking-[-0.02em] text-white">{readiness}%</span>
            <span className="text-[13px]">of {summary.totalControls} controls operating</span>
          </p>
          <SegmentBar
            dark
            label="Control status breakdown"
            segments={summary.byStatus.map((s) => ({ label: s.label, count: s.count, color: s.color }))}
          />
          <p className="text-[12.5px] text-ink-muted">
            SOC 2 Type II also needs an observation period, usually 3 to 12 months, once controls are operating.
            Last automated check: {summary.lastAutomatedRun ? shortDate(summary.lastAutomatedRun) : "never run"}.
          </p>
        </section>

        <Panel id="findings" title="Findings & corrective actions" actions={<span className="text-[13px] text-muted-foreground">{summary.openActions} open</span>} bodyClassName="flex flex-col gap-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/compliance/actions" className="rounded-lg bg-[#fef3f2] p-3.5 transition hover:brightness-[0.98]">
              <span className="block text-[28px] font-semibold text-[#b42318]">{summary.criticalHighActions}</span>
              <span className="text-[12.5px] text-[#7a271a]">Critical or high</span>
            </Link>
            <Link href="/admin/compliance/actions" className="rounded-lg bg-muted p-3.5 transition hover:brightness-[0.98]">
              <span className="block text-[28px] font-semibold">{summary.openActions - summary.criticalHighActions}</span>
              <span className="text-[12.5px] text-muted-foreground">Medium or low</span>
            </Link>
          </div>
          <Link href="/admin/approvals" className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition hover:bg-muted/40">
            <span>
              <b className="font-semibold">{summary.pendingEvidence}</b> evidence {summary.pendingEvidence === 1 ? "item" : "items"} waiting for review
            </span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </Panel>

        <Panel id="gov" title="Governance">
          <ul className="divide-y text-sm">
            <li className="flex items-center justify-between gap-3 px-5 py-3">
              Statement of Applicability decided
              <Pill tone={summary.soaDecided === summary.soaTotal ? "success" : "warning"}>
                {summary.soaDecided} of {summary.soaTotal}
              </Pill>
            </li>
            <li className="flex items-center justify-between gap-3 px-5 py-3">
              Open risks
              <Pill tone={summary.openRisks ? "warning" : "neutral"}>{summary.openRisks}</Pill>
            </li>
            {frameworks.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0 truncate">{f.name} requirements mapped</span>
                <Pill tone={f.mapped === f.total ? "success" : "info"}>
                  {f.mapped} of {f.total}
                </Pill>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel id="domains" title="Controls by domain" description="Gaps are controls not implemented, needing remediation, or with an exception.">
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {[...domains.entries()]
            .sort((a, b) => b[1].gaps - a[1].gaps || a[0].localeCompare(b[0]))
            .map(([domain, d]) => (
              <Link
                key={domain}
                href={`/admin/compliance/controls?domain=${encodeURIComponent(domain)}`}
                className="flex flex-col gap-1.5 bg-card px-5 py-3.5 transition hover:bg-muted/40"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{domain}</span>
                  <span className="size-2 rounded-full" style={{ background: d.gaps ? "#f04438" : d.operating === d.total ? "#17b26a" : "#f79009" }} aria-hidden />
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {d.total} {d.total === 1 ? "control" : "controls"} · {d.operating} operating · {d.gaps} {d.gaps === 1 ? "gap" : "gaps"}
                </span>
              </Link>
            ))}
        </div>
      </Panel>
    </div>
  );
}
