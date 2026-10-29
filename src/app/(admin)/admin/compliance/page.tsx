import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { createDataClient } from "@/lib/supabase/data";
import type { ComplianceControlStatus } from "@/types/supabase";
import { RunChecksButton } from "./run-checks-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ComplianceControlStatus, string> = {
  NOT_ASSESSED: "Not assessed",
  NOT_IMPLEMENTED: "Not implemented",
  IN_PROGRESS: "In progress",
  IMPLEMENTED_AWAITING_EVIDENCE: "Implemented, awaiting evidence",
  OPERATING_EVIDENCED: "Operating and evidenced",
  EXCEPTION_IDENTIFIED: "Exception identified",
  REMEDIATION_REQUIRED: "Remediation required",
  RISK_ACCEPTED: "Risk accepted",
  NOT_APPLICABLE: "Not applicable",
};

const STATUS_VARIANT: Record<ComplianceControlStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NOT_ASSESSED: "outline",
  NOT_IMPLEMENTED: "destructive",
  IN_PROGRESS: "secondary",
  IMPLEMENTED_AWAITING_EVIDENCE: "secondary",
  OPERATING_EVIDENCED: "default",
  EXCEPTION_IDENTIFIED: "destructive",
  REMEDIATION_REQUIRED: "destructive",
  RISK_ACCEPTED: "outline",
  NOT_APPLICABLE: "outline",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

export default async function CompliancePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  const allowed =
    isSuperAdmin(ctx.roleKey) ||
    ctx.permissions.includes("compliance.view") ||
    ctx.permissions.includes("compliance.audit");
  if (!allowed) redirect("/admin/dashboard");
  const canManage = isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.manage");

  const supabase = await createDataClient();
  const [controlsRes, mappingsRes, requirementsRes, frameworksRes, testsRes, evidenceRes, actionsRes] =
    await Promise.all([
      supabase
        .from("compliance_controls")
        .select("id, control_code, title, domain, status, priority, owner_role, current_state")
        .order("control_code"),
      supabase.from("control_requirement_mappings").select("control_id, requirement_id"),
      supabase.from("framework_requirements").select("id, framework_id, ref"),
      supabase.from("compliance_frameworks").select("id, framework_key"),
      supabase
        .from("control_tests")
        .select("control_id, result, executed_at, exceptions_count")
        .order("executed_at", { ascending: false })
        .limit(500),
      supabase.from("evidence_items").select("control_id, status"),
      supabase
        .from("corrective_actions")
        .select("ref, title, severity, status, due_date")
        .neq("status", "CLOSED")
        .order("ref"),
    ]);

  const controls = controlsRes.data ?? [];
  const frameworkKey = new Map((frameworksRes.data ?? []).map((f) => [f.id, f.framework_key]));
  const requirement = new Map(
    (requirementsRes.data ?? []).map((r) => [r.id, { ref: r.ref, framework: frameworkKey.get(r.framework_id) }])
  );
  const refsByControl = new Map<string, { iso: string[]; soc: string[] }>();
  for (const m of mappingsRes.data ?? []) {
    const req = requirement.get(m.requirement_id);
    if (!req) continue;
    const entry = refsByControl.get(m.control_id) ?? { iso: [], soc: [] };
    if (req.framework === "ISO27001_2022") entry.iso.push(req.ref);
    else entry.soc.push(req.ref);
    refsByControl.set(m.control_id, entry);
  }
  const latestTest = new Map<string, { result: string; executed_at: string; exceptions_count: number }>();
  for (const t of testsRes.data ?? []) {
    if (!latestTest.has(t.control_id)) latestTest.set(t.control_id, t);
  }
  const evidence = new Map<string, { accepted: number; pending: number }>();
  for (const e of evidenceRes.data ?? []) {
    const entry = evidence.get(e.control_id) ?? { accepted: 0, pending: 0 };
    if (e.status === "ACCEPTED") entry.accepted += 1;
    if (e.status === "PENDING_REVIEW") entry.pending += 1;
    evidence.set(e.control_id, entry);
  }

  const counts = new Map<ComplianceControlStatus, number>();
  for (const c of controls) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const summary: ComplianceControlStatus[] = [
    "OPERATING_EVIDENCED",
    "IMPLEMENTED_AWAITING_EVIDENCE",
    "IN_PROGRESS",
    "REMEDIATION_REQUIRED",
    "EXCEPTION_IDENTIFIED",
    "NOT_IMPLEMENTED",
    "NOT_ASSESSED",
  ];

  const actions = actionsRes.data ?? [];
  const loadError = controlsRes.error?.message;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Security & Compliance"
        description="Control register mapped to ISO/IEC 27001:2022 and SOC 2. Statuses show implementation and evidence, not an audit opinion or certification."
        actions={canManage ? <RunChecksButton /> : undefined}
      />

      {loadError ? (
        <Card>
          <CardContent className="text-sm text-destructive">
            Could not load the control register: {loadError}. Apply migrations 0022–0025.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {summary.map((status) => (
          <Card key={status} size="sm">
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</span>
              <span className="text-2xl font-semibold tabular-nums">{counts.get(status) ?? 0}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control register ({controls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {controls.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No controls loaded" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ISO 27001</TableHead>
                  <TableHead>SOC 2</TableHead>
                  <TableHead>Latest test</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls.map((c) => {
                  const refs = refsByControl.get(c.id);
                  const test = latestTest.get(c.id);
                  const ev = evidence.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[26rem] whitespace-normal">
                        <div className="font-medium">
                          {c.control_code} · {c.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.domain}
                          {c.priority ? ` · ${c.priority}` : ""}
                          {c.owner_role ? ` · ${c.owner_role}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[12rem] whitespace-normal text-xs">
                        {refs?.iso.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="max-w-[10rem] whitespace-normal text-xs">
                        {refs?.soc.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {test ? (
                          <>
                            <span className={test.result === "PASS" ? "text-success" : "text-destructive"}>
                              {test.result}
                            </span>
                            {test.exceptions_count ? ` (${test.exceptions_count})` : ""}
                            <div className="text-muted-foreground">{formatDate(test.executed_at)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ev ? `${ev.accepted} accepted · ${ev.pending} to review` : "None"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open corrective actions ({actions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No open corrective actions" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((a) => (
                  <TableRow key={a.ref}>
                    <TableCell className="font-medium">{a.ref}</TableCell>
                    <TableCell className="max-w-[28rem] whitespace-normal">{a.title}</TableCell>
                    <TableCell>
                      <Badge variant={a.severity === "CRITICAL" || a.severity === "HIGH" ? "destructive" : "outline"}>
                        {a.severity ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.status.replaceAll("_", " ")}</TableCell>
                    <TableCell className="text-xs">{a.due_date ?? "Not set"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
