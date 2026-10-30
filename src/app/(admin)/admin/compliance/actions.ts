"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { complianceManager } from "@/lib/compliance/access";
import { MANUAL_CONTROL_STATUSES } from "@/lib/compliance/labels";
import { createDataClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import type { ComplianceControlStatus } from "@/types/supabase";

export type ActionResult = { error?: string; success?: boolean };

export type RunChecksResult = {
  error?: string;
  results?: { control_code: string; result: string; exceptions_count: number }[];
};

const EVIDENCE_BUCKET = "compliance-evidence";
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function intOrNull(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function refresh() {
  revalidatePath("/admin/compliance", "layout");
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/dashboard");
}

function dbError(message: string) {
  // Status-gate and integrity triggers raise readable messages; pass them on.
  return message.replace(/^.*?ERROR:\s*/, "");
}

/** Runs the automated control checks now (they also run daily via pg_cron). */
export async function runAutomatedControlChecks(): Promise<RunChecksResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to run control checks." };
  const supabase = await createDataClient();
  const { data, error } = await supabase.rpc("run_automated_control_checks");
  if (error) return { error: error.message };
  refresh();
  return { results: data ?? [] };
}

/** Update a control's status, owner and narrative. The database decides if OPERATING is allowed. */
export async function updateControl(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to change controls." };
  const id = text(formData, "id");
  const status = text(formData, "status") as ComplianceControlStatus;
  if (!id) return { error: "Missing control." };
  if (!MANUAL_CONTROL_STATUSES.includes(status)) return { error: "Choose a valid status." };

  const supabase = await createDataClient();
  const { error } = await supabase
    .from("compliance_controls")
    .update({
      status,
      owner_employee_id: optional(formData, "owner_employee_id"),
      current_state: optional(formData, "current_state"),
      gap_remediation: optional(formData, "gap_remediation"),
      applicability_rationale: optional(formData, "applicability_rationale"),
      next_due_at: text(formData, "next_due_at") ? new Date(`${text(formData, "next_due_at")}T00:00:00Z`).toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

/** Record evidence: an uploaded file (hashed and stored privately) or a reference to a system record. */
export async function addEvidence(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to add evidence." };
  const controlId = text(formData, "control_id");
  const title = text(formData, "title");
  const evidenceType = text(formData, "evidence_type");
  const sourceSystem = text(formData, "source_system");
  if (!controlId || title.length < 4) return { error: "Give the evidence a clear title." };
  if (!sourceSystem) return { error: "Say which system the evidence came from." };
  const periodStart = optional(formData, "period_start");
  const periodEnd = optional(formData, "period_end");
  if (periodStart && periodEnd && periodEnd < periodStart) return { error: "The period end is before its start." };

  const supabase = await createDataClient();
  const { data: control } = await supabase.from("compliance_controls").select("control_code").eq("id", controlId).maybeSingle();
  if (!control) return { error: "Control not found." };

  let storagePath: string | null = null;
  let sha256: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_EVIDENCE_BYTES) return { error: "Files must be 25 MB or smaller." };
    const bytes = Buffer.from(await file.arrayBuffer());
    sha256 = createHash("sha256").update(bytes).digest("hex");
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    storagePath = `${control.control_code}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await createServiceClient()
      .storage.from(EVIDENCE_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };
  }
  if (!storagePath && !optional(formData, "source_record_id")) {
    return { error: "Attach a file or give the record ID / link in the source system." };
  }

  const { error } = await supabase.from("evidence_items").insert({
    control_id: controlId,
    title,
    evidence_type: evidenceType || "DOCUMENT",
    collection_method: storagePath ? "MANUAL_UPLOAD" : "SYSTEM_EXPORT",
    source_system: sourceSystem,
    source_record_id: optional(formData, "source_record_id"),
    period_start: periodStart,
    period_end: periodEnd,
    collected_by: ctx.employeeId,
    storage_path: storagePath,
    sha256,
    limitations: optional(formData, "limitations"),
  });
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

/** Record a manual control test. Independence is computed by the database. */
export async function recordControlTest(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to record tests." };
  const controlId = text(formData, "control_id");
  const method = text(formData, "method");
  const result = text(formData, "result") as "PASS" | "FAIL" | "PARTIAL";
  const notes = text(formData, "notes");
  if (!["INSPECTION", "REPERFORMANCE", "INQUIRY", "OBSERVATION"].includes(method)) return { error: "Choose how you tested." };
  if (!["PASS", "FAIL", "PARTIAL"].includes(result)) return { error: "Choose a result." };
  if (notes.length < 10) return { error: "Describe what you tested and what you found (10+ characters)." };
  const exceptionsText = text(formData, "exceptions");
  const exceptions = exceptionsText
    ? exceptionsText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ note: line }))
    : [];
  if (result !== "PASS" && exceptions.length === 0) return { error: "List at least one exception for a failed or partial test." };

  const supabase = await createDataClient();
  const { error } = await supabase.from("control_tests").insert({
    control_id: controlId,
    executed_by: ctx.employeeId,
    execution_identity: `${ctx.fullName} (${ctx.employeeCode})`,
    method,
    result,
    notes,
    exceptions,
    population: { sample: text(formData, "population") || null },
    evidence_id: optional(formData, "evidence_id"),
  });
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

export async function saveRisk(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to change risks." };
  const id = text(formData, "id");
  const title = text(formData, "title");
  if (title.length < 4) return { error: "Give the risk a clear title." };
  const treatment = (text(formData, "treatment") || null) as "MITIGATE" | "AVOID" | "TRANSFER" | "ACCEPT" | null;
  const status = (text(formData, "status") || "IDENTIFIED") as
    | "IDENTIFIED"
    | "ASSESSED"
    | "TREATMENT_IN_PROGRESS"
    | "TREATED"
    | "ACCEPTED"
    | "CLOSED";
  const owner = optional(formData, "owner_employee_id");
  const accepting = status === "ACCEPTED";
  if (accepting) {
    if (treatment !== "ACCEPT") return { error: "Set the treatment to Accept before accepting a risk." };
    if (owner === ctx.employeeId) return { error: "The risk owner cannot approve their own risk acceptance." };
    if (!text(formData, "acceptance_expires_at")) return { error: "Risk acceptance needs an expiry date." };
  }

  const payload = {
    title,
    description: optional(formData, "description"),
    asset: optional(formData, "asset"),
    threat: optional(formData, "threat"),
    vulnerability: optional(formData, "vulnerability"),
    impacts_confidentiality: formData.get("impacts_confidentiality") === "on",
    impacts_integrity: formData.get("impacts_integrity") === "on",
    impacts_availability: formData.get("impacts_availability") === "on",
    likelihood: intOrNull(formData, "likelihood"),
    impact: intOrNull(formData, "impact"),
    residual_likelihood: intOrNull(formData, "residual_likelihood"),
    residual_impact: intOrNull(formData, "residual_impact"),
    treatment,
    treatment_plan: optional(formData, "treatment_plan"),
    owner_employee_id: owner,
    due_date: optional(formData, "due_date"),
    next_review_date: optional(formData, "next_review_date"),
    status,
    ...(accepting
      ? {
          acceptance_approved_by: ctx.employeeId,
          acceptance_approved_at: new Date().toISOString(),
          acceptance_expires_at: text(formData, "acceptance_expires_at"),
        }
      : {}),
  };

  const supabase = await createDataClient();
  let riskId = id;
  if (id) {
    const { error } = await supabase.from("risks").update(payload).eq("id", id);
    if (error) return { error: dbError(error.message) };
  } else {
    const { data: codes } = await supabase.from("risks").select("risk_code");
    const highest = (codes ?? []).reduce((max, row) => Math.max(max, Number(row.risk_code.replace(/\D/g, "")) || 0), 0);
    const code = `R-${String(highest + 1).padStart(3, "0")}`;
    const { data, error } = await supabase.from("risks").insert({ risk_code: code, ...payload }).select("id").single();
    if (error || !data) return { error: dbError(error?.message ?? "Could not create the risk.") };
    riskId = data.id;
  }

  const controlIds = formData.getAll("control_ids").map(String).filter(Boolean);
  await supabase.from("risk_control_links").delete().eq("risk_id", riskId);
  if (controlIds.length) {
    const { error } = await supabase.from("risk_control_links").insert(controlIds.map((control_id) => ({ risk_id: riskId, control_id })));
    if (error) return { error: dbError(error.message) };
  }
  refresh();
  return { success: true };
}

export async function saveSoaEntry(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to edit the Statement of Applicability." };
  const id = text(formData, "id");
  const applicableRaw = text(formData, "applicable");
  const applicable = applicableRaw === "yes" ? true : applicableRaw === "no" ? false : null;
  const justification = optional(formData, "justification");
  if (applicable !== null && !justification) return { error: "Every decision needs a justification." };
  const implementation = text(formData, "implementation_status") as "NOT_ASSESSED" | "NOT_IMPLEMENTED" | "PARTIAL" | "IMPLEMENTED";

  const supabase = await createDataClient();
  const { data: current } = await supabase.from("soa_entries").select("revision").eq("id", id).maybeSingle();
  if (!current) return { error: "Entry not found." };
  const { error } = await supabase
    .from("soa_entries")
    .update({
      applicable,
      justification,
      implementation_status: implementation || "NOT_ASSESSED",
      revision: current.revision + 1,
      approved_by: null,
      approved_at: null,
    })
    .eq("id", id);
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

export async function updateCorrectiveAction(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to change corrective actions." };
  const id = text(formData, "id");
  const status = text(formData, "status") as "OPEN" | "IN_PROGRESS" | "READY_FOR_VERIFICATION" | "CLOSED";
  if (!["OPEN", "IN_PROGRESS", "READY_FOR_VERIFICATION", "CLOSED"].includes(status)) return { error: "Choose a status." };
  const closureEvidence = optional(formData, "closure_evidence_id");

  const supabase = await createDataClient();
  const { data: row } = await supabase.from("corrective_actions").select("owner_employee_id, status").eq("id", id).maybeSingle();
  if (!row) return { error: "Corrective action not found." };
  const owner = optional(formData, "owner_employee_id");

  if (status === "CLOSED") {
    if (!closureEvidence) return { error: "Pick the accepted evidence that proves the fix before closing." };
    if (owner && owner === ctx.employeeId) return { error: "The owner cannot verify and close their own action. Ask another reviewer." };
    const { data: ev } = await supabase.from("evidence_items").select("status").eq("id", closureEvidence).maybeSingle();
    if (ev?.status !== "ACCEPTED") return { error: "Closure evidence must be accepted first." };
  }

  const { error } = await supabase
    .from("corrective_actions")
    .update({
      status,
      owner_employee_id: owner,
      due_date: optional(formData, "due_date"),
      ...(status === "CLOSED"
        ? { closure_evidence_id: closureEvidence, closed_by: ctx.employeeId, closed_at: new Date().toISOString() }
        : { closure_evidence_id: null, closed_by: null, closed_at: null }),
    })
    .eq("id", id);
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

export async function requestException(formData: FormData): Promise<ActionResult> {
  const ctx = await complianceManager();
  if (!ctx) return { error: "You do not have permission to request exceptions." };
  const kind = text(formData, "kind") as "SEGREGATION_OF_DUTIES" | "POLICY" | "CONTROL_FAILURE" | "TECHNICAL";
  const description = text(formData, "description");
  const compensating = text(formData, "compensating_control");
  const expires = text(formData, "expires_at");
  if (!["SEGREGATION_OF_DUTIES", "POLICY", "CONTROL_FAILURE", "TECHNICAL"].includes(kind)) return { error: "Choose a type." };
  if (description.length < 15) return { error: "Describe the exception (15+ characters)." };
  if (compensating.length < 10) return { error: "Describe the compensating control." };
  if (!expires) return { error: "Exceptions must expire. Pick a date." };

  const supabase = await createDataClient();
  const { error } = await supabase.from("control_exceptions").insert({
    control_id: optional(formData, "control_id"),
    kind,
    description,
    compensating_control: compensating,
    expires_at: expires,
    requested_by: ctx.employeeId,
    status: "REQUESTED",
  });
  if (error) return { error: dbError(error.message) };
  refresh();
  return { success: true };
}

/** Short-lived download link for a stored evidence file. */
export async function evidenceDownloadUrl(evidenceId: string): Promise<{ url?: string; error?: string }> {
  const { requireCompliance } = await import("@/lib/compliance/access");
  await requireCompliance();
  const service = createServiceClient();
  const { data } = await service.from("evidence_items").select("storage_path").eq("id", evidenceId).maybeSingle();
  if (!data?.storage_path) return { error: "This evidence has no stored file." };
  const { data: signed, error } = await service.storage.from(EVIDENCE_BUCKET).createSignedUrl(data.storage_path, 300);
  if (error || !signed) return { error: error?.message ?? "Could not create a download link." };
  return { url: signed.signedUrl };
}
