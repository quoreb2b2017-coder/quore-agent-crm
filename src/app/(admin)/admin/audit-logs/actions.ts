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

export type AuditFieldChange = { field: string; before: string | null; after: string | null };

export type AuditEntryDetail = {
  fields: AuditFieldChange[];
  requestId: string | null;
  recordId: string | null;
  rowHash: string | null;
};

const NEVER_SHOWN = /password|token|secret/i;
const NOISE_FIELDS = new Set(["updated_at", "version"]);
const MAX_VALUE_LENGTH = 600;

function displayValue(field: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (NEVER_SHOWN.test(field)) return "Hidden";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/** Before and after for one entry. Loaded on demand so the list never carries everyone's data. */
export async function loadAuditEntryDetail(
  id: string
): Promise<AuditEntryDetail | { error: string }> {
  if (!(await requireAuditor())) return { error: "Only Super Admin or an auditor can read this." };

  const { data, error } = await createServiceClient()
    .from("audit_logs")
    .select("old_data, new_data, request_id, record_id, row_hash")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Entry not found." };

  const before = (data.old_data ?? {}) as Record<string, unknown>;
  const after = (data.new_data ?? {}) as Record<string, unknown>;
  const isChange = Boolean(data.old_data && data.new_data);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => !NOISE_FIELDS.has(field))
    // A change lists what moved. A create or delete lists what the record held.
    .filter((field) =>
      isChange
        ? JSON.stringify(before[field]) !== JSON.stringify(after[field])
        : (before[field] ?? after[field]) != null
    )
    .sort()
    .map((field) => ({
      field,
      before: displayValue(field, before[field]),
      after: displayValue(field, after[field]),
    }));

  return { fields, requestId: data.request_id, recordId: data.record_id, rowHash: data.row_hash };
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
