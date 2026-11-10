import "server-only";

import { POLICY_DOCUMENTS, type PolicyDocument } from "@/lib/policies";
import { createServiceClient } from "@/lib/supabase/service";

/** Documents this person has not acknowledged in their current version. Empty until migration 0044 is applied. */
export async function pendingPolicies(employeeId: string): Promise<PolicyDocument[]> {
  const { data, error } = await createServiceClient()
    .from("policy_acknowledgements")
    .select("document_key, version")
    .eq("employee_id", employeeId);
  if (error) return [];
  const done = new Set((data ?? []).map((row) => `${row.document_key}|${row.version}`));
  // Drafts are never shown to staff until management makes them live.
  return POLICY_DOCUMENTS.filter(
    (document) => document.live && !done.has(`${document.key}|${document.version}`)
  );
}

export type AcknowledgementRow = {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  acknowledgedAt: string | null;
};

/** For each current document: every active person and when they acknowledged it, if they have. */
export async function acknowledgementReport() {
  const service = createServiceClient();
  const [{ data: people }, { data: rows, error }] = await Promise.all([
    service
      .from("employees")
      .select("id, full_name, employee_code")
      .in("employment_status", ["ACTIVE", "ON_LEAVE"])
      .order("full_name"),
    service.from("policy_acknowledgements").select("employee_id, document_key, version, acknowledged_at"),
  ]);
  return {
    ready: !error,
    documents: POLICY_DOCUMENTS.map((document) => {
      const at = new Map(
        (rows ?? [])
          .filter((row) => row.document_key === document.key && row.version === document.version)
          .map((row) => [row.employee_id, row.acknowledged_at])
      );
      const list: AcknowledgementRow[] = (people ?? []).map((person) => ({
        employeeId: person.id,
        fullName: person.full_name,
        employeeCode: person.employee_code,
        acknowledgedAt: at.get(person.id) ?? null,
      }));
      return { document, rows: list };
    }),
  };
}
