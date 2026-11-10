import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { isManagement, isSuperAdmin } from "@/lib/permissions/roles";
import type { EmployeeContext } from "@/lib/permissions/types";

export type ApprovalKind = "MEETING" | "LEAVE" | "SALARY" | "EVIDENCE" | "EXCEPTION";

export type ApprovalItem = {
  id: string;
  kind: ApprovalKind;
  title: string;
  subtitle: string;
  requestedAt: string;
  requesterId: string | null;
  requesterName: string;
  details: { label: string; value: string }[];
  /** Plain-language rule shown next to the decision buttons. */
  rule: string;
  /** Leave approvals need a leave type; this is the one requested. */
  leaveTypeId?: string;
  /** True when the viewer is the requester and so cannot decide (SoD). */
  selfBlocked: boolean;
};

export type ApprovalsData = {
  items: ApprovalItem[];
  leaveTypes: { id: string; name: string; is_paid: boolean }[];
  counts: Record<ApprovalKind | "ALL", number>;
};

function canSeeCompliance(ctx: EmployeeContext) {
  return isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.manage");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Everything waiting for a decision by the signed-in manager, from every
 * module, in one list. Each source keeps its own server action and rules;
 * this only reads.
 */
export const loadApprovals = cache(async (ctx: EmployeeContext): Promise<ApprovalsData> => {
  const empty: ApprovalsData = {
    items: [],
    leaveTypes: [],
    counts: { ALL: 0, MEETING: 0, LEAVE: 0, SALARY: 0, EVIDENCE: 0, EXCEPTION: 0 },
  };
  if (!isManagement(ctx.roleKey) && !canSeeCompliance(ctx)) return empty;

  const service = createServiceClient();
  const compliance = canSeeCompliance(ctx);

  const [meetingsRes, leaveRes, typesRes, evidenceRes, exceptionsRes, peopleRes, salaryRes] = await Promise.all([
    isSuperAdmin(ctx.roleKey)
      ? service
          .from("meetings")
          .select("id, employee_id, requested_at")
          .is("ended_at", null)
          .is("started_at", null)
          .order("requested_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; employee_id: string; requested_at: string }[] }),
    isManagement(ctx.roleKey)
      ? service
          .from("leave_requests")
          .select("id, employee_id, leave_type_id, start_date, end_date, days_count, reason, created_at")
          .eq("status", "PENDING")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    service.from("leave_types").select("id, name, is_paid").order("name"),
    compliance
      ? service
          .from("evidence_items")
          .select("id, title, evidence_type, source_system, collected_at, collected_by, period_start, period_end, control_id")
          .eq("status", "PENDING_REVIEW")
          .order("collected_at", { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
    compliance
      ? service
          .from("control_exceptions")
          .select("id, kind, description, compensating_control, requested_by, expires_at, created_at, control_id")
          .eq("status", "REQUESTED")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    service.from("employees").select("id, full_name, employee_code"),
    // Salary changes are decided by Super Admin only. Fails quietly until migration 0043 is applied.
    isSuperAdmin(ctx.roleKey)
      ? service
          .from("salary_change_requests")
          .select("id, employee_id, record, requested_by, created_at")
          .eq("status", "PENDING")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const { data: controlRows } = compliance
    ? await service.from("compliance_controls").select("id, control_code, title")
    : { data: [] as { id: string; control_code: string; title: string }[] };
  const controls = new Map((controlRows ?? []).map((c) => [c.id, c]));

  const people = new Map(
    ((peopleRes.data ?? []) as { id: string; full_name: string; employee_code: string }[]).map((p) => [p.id, p])
  );
  const name = (id: string | null) => (id ? people.get(id)?.full_name ?? "Unknown employee" : "System");
  const code = (id: string | null) => (id ? people.get(id)?.employee_code ?? "" : "");
  const types = (typesRes.data ?? []) as { id: string; name: string; is_paid: boolean }[];
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  const items: ApprovalItem[] = [];

  for (const m of (meetingsRes.data ?? []) as { id: string; employee_id: string; requested_at: string }[]) {
    if (!people.has(m.employee_id)) continue;
    items.push({
      id: m.id,
      kind: "MEETING",
      title: `${name(m.employee_id)} asked for a meeting`,
      subtitle: `${code(m.employee_id)} · meeting time counts as working time`,
      requestedAt: m.requested_at,
      requesterId: m.employee_id,
      requesterName: name(m.employee_id),
      details: [
        { label: "Employee", value: `${name(m.employee_id)} (${code(m.employee_id)})` },
        { label: "Requested", value: new Date(m.requested_at).toISOString() },
      ],
      rule: "Accepting starts the meeting timer for the employee. Rejecting returns them to their shift.",
      selfBlocked: m.employee_id === ctx.employeeId,
    });
  }

  type LeaveRow = {
    id: string;
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string | null;
    created_at: string;
  };
  for (const l of (leaveRes.data ?? []) as LeaveRow[]) {
    items.push({
      id: l.id,
      kind: "LEAVE",
      title: `${name(l.employee_id)} · ${Number(l.days_count)} day${Number(l.days_count) === 1 ? "" : "s"} of leave`,
      subtitle: `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)} · ${typeName.get(l.leave_type_id) ?? "Leave"}`,
      requestedAt: l.created_at,
      requesterId: l.employee_id,
      requesterName: name(l.employee_id),
      details: [
        { label: "Employee", value: `${name(l.employee_id)} (${code(l.employee_id)})` },
        { label: "Dates", value: `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)}` },
        { label: "Days", value: String(Number(l.days_count)) },
        { label: "Requested type", value: typeName.get(l.leave_type_id) ?? "—" },
        { label: "Reason", value: l.reason?.trim() || "No reason given" },
      ],
      rule: "Approving deducts the days from the employee's balance. You cannot approve your own leave.",
      leaveTypeId: l.leave_type_id,
      selfBlocked: l.employee_id === ctx.employeeId,
    });
  }

  type SalaryRow = {
    id: string;
    employee_id: string;
    record: { base_salary?: number; effective_from?: string; pay_frequency?: string; currency?: string } | null;
    requested_by: string | null;
    created_at: string;
  };
  for (const s of (salaryRes.data ?? []) as SalaryRow[]) {
    const base = Number(s.record?.base_salary ?? 0);
    const money = `${s.record?.currency ?? "INR"} ${base.toLocaleString("en-IN")}`;
    items.push({
      id: s.id,
      kind: "SALARY",
      title: `Salary change for ${name(s.employee_id)}`,
      subtitle: `${money} ${String(s.record?.pay_frequency ?? "MONTHLY").toLowerCase()} · from ${fmtDate(s.record?.effective_from)}`,
      requestedAt: s.created_at,
      requesterId: s.requested_by,
      requesterName: name(s.requested_by),
      details: [
        { label: "Employee", value: `${name(s.employee_id)} (${code(s.employee_id)})` },
        { label: "Base salary", value: money },
        { label: "Pay frequency", value: String(s.record?.pay_frequency ?? "MONTHLY").toLowerCase() },
        { label: "Effective from", value: fmtDate(s.record?.effective_from) },
        { label: "Asked by", value: name(s.requested_by) },
      ],
      rule: "Nothing changes until you approve. Approving writes the salary and rebuilds payslips. The person who asked cannot approve it (ISO A.5.3).",
      selfBlocked: s.requested_by === ctx.employeeId,
    });
  }

  type EvidenceRow = {
    id: string;
    title: string;
    evidence_type: string;
    source_system: string;
    collected_at: string;
    collected_by: string | null;
    period_start: string | null;
    period_end: string | null;
    control_id: string;
  };
  for (const e of (evidenceRes.data ?? []) as EvidenceRow[]) {
    const control = controls.get(e.control_id);
    items.push({
      id: e.id,
      kind: "EVIDENCE",
      title: e.title,
      subtitle: `${control?.control_code ?? "Control"} · ${e.evidence_type.replaceAll("_", " ").toLowerCase()} from ${e.source_system}`,
      requestedAt: e.collected_at,
      requesterId: e.collected_by,
      requesterName: name(e.collected_by),
      details: [
        { label: "Control", value: control ? `${control.control_code} · ${control.title}` : "—" },
        { label: "Collected by", value: name(e.collected_by) },
        { label: "Period", value: e.period_start ? `${fmtDate(e.period_start)} – ${fmtDate(e.period_end)}` : "Point in time" },
      ],
      rule: "Accepted evidence becomes read-only. The person who collected it cannot review it (ISO A.5.3, SOC 2 CC1.3).",
      selfBlocked: e.collected_by === ctx.employeeId,
    });
  }

  type ExceptionRow = {
    id: string;
    kind: string;
    description: string;
    compensating_control: string | null;
    requested_by: string | null;
    expires_at: string | null;
    created_at: string;
    control_id: string | null;
  };
  for (const x of (exceptionsRes.data ?? []) as ExceptionRow[]) {
    items.push({
      id: x.id,
      kind: "EXCEPTION",
      title: `Security exception · ${x.kind.replaceAll("_", " ").toLowerCase()}`,
      subtitle: `${(x.control_id && controls.get(x.control_id)?.control_code) || "No control"} · requested by ${name(x.requested_by)}`,
      requestedAt: x.created_at,
      requesterId: x.requested_by,
      requesterName: name(x.requested_by),
      details: [
        { label: "What", value: x.description },
        { label: "Compensating control", value: x.compensating_control ?? "Not given" },
        { label: "Expires", value: fmtDate(x.expires_at) },
      ],
      rule: "An exception needs a compensating control and an expiry date, and must be approved by someone other than the requester.",
      selfBlocked: x.requested_by === ctx.employeeId,
    });
  }

  items.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const counts = { ...empty.counts };
  for (const item of items) counts[item.kind] += 1;
  counts.ALL = items.length;
  return { items, leaveTypes: types, counts };
});

/**
 * Badge count for the app bar and side menu, shown on every admin page.
 * Uses count-only queries (no rows transferred) with exactly the same filters
 * as loadApprovals, instead of loading every request, person and control.
 */
export async function countApprovals(ctx: EmployeeContext) {
  if (!isManagement(ctx.roleKey) && !canSeeCompliance(ctx)) return 0;
  try {
    const service = createServiceClient();
    const compliance = canSeeCompliance(ctx);
    const zero = Promise.resolve({ count: 0 });
    const [meetings, leave, evidence, exceptions, salary] = await Promise.all([
      isSuperAdmin(ctx.roleKey)
        ? service.from("meetings").select("id", { count: "exact", head: true }).is("ended_at", null).is("started_at", null)
        : zero,
      isManagement(ctx.roleKey)
        ? service.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING")
        : zero,
      compliance
        ? service.from("evidence_items").select("id", { count: "exact", head: true }).eq("status", "PENDING_REVIEW")
        : zero,
      compliance
        ? service.from("control_exceptions").select("id", { count: "exact", head: true }).eq("status", "REQUESTED")
        : zero,
      isSuperAdmin(ctx.roleKey)
        ? service.from("salary_change_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING")
        : zero,
    ]);
    // loadApprovals lists at most 200 evidence items; keep the badge consistent with it.
    return (
      (meetings.count ?? 0) +
      (leave.count ?? 0) +
      Math.min(evidence.count ?? 0, 200) +
      (exceptions.count ?? 0) +
      (salary.count ?? 0)
    );
  } catch {
    return 0;
  }
}
