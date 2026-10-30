"use server";

import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createServiceClient } from "@/lib/supabase/service";

export type VerifyResult = { error?: string; ok?: boolean; checked?: number; problems?: { seq: number; reason: string }[] };

/** Recomputes the SHA-256 hash chain over every sealed audit row. */
export async function verifyAuditChain(): Promise<VerifyResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !(isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.audit"))) {
    return { error: "Only Super Admin or an auditor can verify the audit log." };
  }
  const service = createServiceClient();
  const [{ data, error }, { count }] = await Promise.all([
    service.rpc("verify_audit_chain", { p_from_seq: 1 }),
    service.from("audit_logs").select("id", { count: "exact", head: true }).not("row_hash", "is", null),
  ]);
  if (error) return { error: error.message };
  const problems = (data ?? []).map((row) => ({ seq: row.seq, reason: row.reason }));
  return { ok: problems.length === 0, checked: count ?? 0, problems: problems.slice(0, 20) };
}
