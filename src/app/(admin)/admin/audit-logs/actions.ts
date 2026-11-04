"use server";

import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { verifyAuditChainIntegrity } from "@/lib/audit/verify-chain";
import { syncAuditCoverageFromLiveData } from "@/lib/audit/sync-coverage";
import { createServiceClient } from "@/lib/supabase/service";

export type VerifyResult = {
  error?: string;
  ok?: boolean;
  checked?: number;
  problems?: { seq: number; reason: string }[];
  sealed?: number;
  synced?: number;
  needsSealSql?: boolean;
};

async function requireAuditor() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !(isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.audit"))) {
    return null;
  }
  return ctx;
}

/**
 * 1) Pull any live Supabase rows missing from audit into the chain
 * 2) Seal unsealed rows if seal RPC exists
 * 3) Verify the hash chain
 */
export async function verifyAuditChain(): Promise<VerifyResult> {
  if (!(await requireAuditor())) {
    return { error: "Only Super Admin or an auditor can verify the audit log." };
  }

  const sync = await syncAuditCoverageFromLiveData();
  if (sync.needsTriggerSql) {
    return {
      error:
        sync.errors[0] ??
        "Run supabase/migrations/0039_audit_triggers_complete.sql in the Supabase SQL Editor, then click Verify again.",
      synced: sync.touched,
    };
  }

  const seal = await sealLegacyAuditLogs();
  if (seal.error && !seal.needsSealSql) return { error: seal.error, synced: sync.touched };

  const result = await verifyAuditChainIntegrity(1);
  if (result.error) {
    return { error: result.error, needsSealSql: seal.needsSealSql, synced: sync.touched };
  }
  return {
    ok: result.ok,
    checked: result.checked,
    problems: result.problems.slice(0, 20),
    sealed: seal.sealed,
    synced: sync.touched,
    needsSealSql: seal.needsSealSql,
  };
}

/** One-time backfill via seal_legacy_audit_logs() (migration 0038). */
export async function sealLegacyAuditLogs(): Promise<{
  sealed?: number;
  error?: string;
  needsSealSql?: boolean;
}> {
  if (!(await requireAuditor())) {
    return { error: "Only Super Admin or an auditor can seal the audit log." };
  }

  const service = createServiceClient();
  const { count: unsealed } = await service
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .is("row_hash", null);

  if (!unsealed) return { sealed: 0 };

  const rpc = await service.rpc("seal_legacy_audit_logs");
  if (rpc.error) {
    if (/Could not find the function|schema cache|PGRST202/i.test(rpc.error.message)) {
      return {
        needsSealSql: true,
        error:
          "Legacy rows are still unsealed. Run supabase/migrations/0038_seal_legacy_audit_logs.sql in the Supabase SQL Editor, then click Verify again.",
      };
    }
    return { error: rpc.error.message };
  }
  return { sealed: Number(rpc.data ?? 0) };
}
