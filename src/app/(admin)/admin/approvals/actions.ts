"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createDataClient } from "@/lib/supabase/data";

type Result = { error?: string };

async function complianceReviewer() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;
  if (!isSuperAdmin(ctx.roleKey) && !ctx.permissions.includes("compliance.manage")) return null;
  return ctx;
}

/** Accept or reject evidence. The database blocks self-review and rewrites. */
export async function reviewEvidence(id: string, decision: "ACCEPTED" | "REJECTED", note: string): Promise<Result> {
  const ctx = await complianceReviewer();
  if (!ctx) return { error: "You do not have permission to review evidence." };
  if (decision === "REJECTED" && note.trim().length < 5) return { error: "Say why the evidence is rejected." };

  const supabase = await createDataClient();
  const { data: item } = await supabase.from("evidence_items").select("id, collected_by, status").eq("id", id).maybeSingle();
  if (!item) return { error: "Evidence not found." };
  if (item.status !== "PENDING_REVIEW") return { error: "This evidence was already reviewed." };
  if (item.collected_by === ctx.employeeId) return { error: "You collected this evidence, so someone else must review it." };

  const { error } = await supabase
    .from("evidence_items")
    .update({
      status: decision,
      review_note: note.trim() || null,
      reviewed_by: ctx.employeeId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING_REVIEW");
  if (error) return { error: error.message };
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/compliance", "layout");
  return {};
}

/** Approve or reject a requested security exception. Requester cannot approve. */
export async function decideException(id: string, decision: "APPROVED" | "REJECTED"): Promise<Result> {
  const ctx = await complianceReviewer();
  if (!ctx) return { error: "You do not have permission to decide security exceptions." };

  const supabase = await createDataClient();
  const { data: row } = await supabase
    .from("control_exceptions")
    .select("id, requested_by, status, compensating_control, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Exception not found." };
  if (row.status !== "REQUESTED") return { error: "This exception was already decided." };
  if (row.requested_by === ctx.employeeId) return { error: "You requested this exception, so someone else must approve it." };
  if (decision === "APPROVED" && (!row.compensating_control || !row.expires_at)) {
    return { error: "An exception needs a compensating control and an expiry date before it can be approved." };
  }

  const { error } = await supabase
    .from("control_exceptions")
    .update(
      decision === "APPROVED"
        ? { status: "APPROVED", approved_by: ctx.employeeId, approved_at: new Date().toISOString() }
        : { status: "REJECTED" }
    )
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/compliance", "layout");
  return {};
}
