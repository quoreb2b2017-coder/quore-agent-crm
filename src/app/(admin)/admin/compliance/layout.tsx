import { requireCompliance } from "@/lib/compliance/access";
import { loadComplianceSummary } from "@/lib/compliance/summary";
import { PageHeader } from "@/components/dashboard/page-header";
import { RunChecksButton } from "./run-checks-button";
import { ComplianceTabs } from "./compliance-tabs";

export default async function ComplianceLayout({ children }: { children: React.ReactNode }) {
  const { manage } = await requireCompliance();
  const summary = await loadComplianceSummary();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="ISO/IEC 27001:2022 · SOC 2 Type II (Security)"
        title="Security & Compliance"
        description="Statuses describe production today. Nothing counts as operating until its evidence is accepted by someone other than the person who collected it and its latest test passed."
        actions={manage ? <RunChecksButton /> : undefined}
      />
      <ComplianceTabs
        badges={{
          "/admin/compliance/evidence": summary.pendingEvidence,
          "/admin/compliance/actions": summary.criticalHighActions,
        }}
      />
      {children}
    </div>
  );
}
