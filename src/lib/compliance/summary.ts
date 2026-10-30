import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { CONTROL_STATUS, CONTROL_STATUS_ORDER } from "@/lib/compliance/labels";
import type { ComplianceControlStatus } from "@/types/supabase";

export type ComplianceSummary = {
  totalControls: number;
  operating: number;
  byStatus: { status: ComplianceControlStatus; label: string; color: string; count: number }[];
  openActions: number;
  criticalHighActions: number;
  pendingEvidence: number;
  openRisks: number;
  soaDecided: number;
  soaTotal: number;
  lastAutomatedRun: string | null;
};

export async function loadComplianceSummary(): Promise<ComplianceSummary> {
  const service = createServiceClient();
  const [controls, actions, evidence, risks, soa, lastTest] = await Promise.all([
    service.from("compliance_controls").select("status"),
    service.from("corrective_actions").select("status, severity"),
    service.from("evidence_items").select("id", { count: "exact", head: true }).eq("status", "PENDING_REVIEW"),
    service.from("risks").select("status"),
    service.from("soa_entries").select("applicable"),
    service
      .from("control_tests")
      .select("executed_at")
      .eq("method", "AUTOMATED")
      .order("executed_at", { ascending: false })
      .limit(1),
  ]);

  const counts = new Map<ComplianceControlStatus, number>();
  for (const row of controls.data ?? []) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const open = (actions.data ?? []).filter((a) => a.status !== "CLOSED" && a.status !== "RISK_ACCEPTED");

  return {
    totalControls: (controls.data ?? []).length,
    operating: counts.get("OPERATING_EVIDENCED") ?? 0,
    byStatus: CONTROL_STATUS_ORDER.map((status) => ({
      status,
      label: CONTROL_STATUS[status].label,
      color: CONTROL_STATUS[status].color,
      count: counts.get(status) ?? 0,
    })).filter((row) => row.count > 0),
    openActions: open.length,
    criticalHighActions: open.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH").length,
    pendingEvidence: evidence.count ?? 0,
    openRisks: (risks.data ?? []).filter((r) => r.status !== "CLOSED" && r.status !== "TREATED").length,
    soaDecided: (soa.data ?? []).filter((s) => s.applicable !== null).length,
    soaTotal: (soa.data ?? []).length,
    lastAutomatedRun: lastTest.data?.[0]?.executed_at ?? null,
  };
}
