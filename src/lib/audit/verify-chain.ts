import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type ChainProblem = { seq: number; reason: string };

const INSTALL_HINT =
  "Audit hash chain is not installed yet. Open Supabase → SQL Editor, run supabase/migrations/0037_audit_chain_verify.sql, then click Verify again.";

function isMissingChainSchema(message: string) {
  return /Could not find the function|schema cache|PGRST202|column .* does not exist|42703|row_hash|prev_hash|\.seq/i.test(
    message
  );
}

/**
 * Prefer DB rpc verify_audit_chain; if PostgREST has not loaded it yet but
 * columns exist, walk the chain in-app (prev_hash linkage).
 */
export async function verifyAuditChainIntegrity(fromSeq = 1): Promise<{
  ok: boolean;
  checked: number;
  problems: ChainProblem[];
  error?: string;
  source?: "rpc" | "app";
}> {
  const service = createServiceClient();

  const rpc = await service.rpc("verify_audit_chain", { p_from_seq: fromSeq });
  if (!rpc.error) {
    const { count } = await service
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .not("row_hash", "is", null);
    const problems = (rpc.data ?? []).map((row: { seq: number; reason: string }) => ({
      seq: Number(row.seq),
      reason: String(row.reason),
    }));
    return {
      ok: problems.length === 0,
      checked: count ?? 0,
      problems: problems.slice(0, 20),
      source: "rpc",
    };
  }

  if (!isMissingChainSchema(rpc.error.message)) {
    return { ok: false, checked: 0, problems: [], error: rpc.error.message };
  }

  const { data: rows, error: loadError } = await service
    .from("audit_logs")
    .select("seq, prev_hash, row_hash")
    .not("row_hash", "is", null)
    .gte("seq", fromSeq)
    .order("seq", { ascending: true });

  if (loadError) {
    return {
      ok: false,
      checked: 0,
      problems: [],
      error: isMissingChainSchema(loadError.message) ? INSTALL_HINT : loadError.message,
    };
  }

  let prev: string | null = null;
  let first = true;
  const problems: ChainProblem[] = [];
  for (const row of rows ?? []) {
    if (first) {
      prev = row.prev_hash;
      first = false;
    }
    if ((row.prev_hash ?? null) !== (prev ?? null)) {
      problems.push({
        seq: Number(row.seq),
        reason: "prev_hash mismatch (row removed or reordered)",
      });
      break;
    }
    if (!row.row_hash) {
      problems.push({ seq: Number(row.seq), reason: "missing row_hash" });
      break;
    }
    prev = row.row_hash;
  }

  return {
    ok: problems.length === 0,
    checked: rows?.length ?? 0,
    problems,
    source: "app",
  };
}
