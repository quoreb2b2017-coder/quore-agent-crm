import { pendingPolicies } from "@/lib/queries/policies";
import { PolicyAcknowledgementDialog } from "@/components/policies/policy-acknowledgement-dialog";

/** Streams in after the page, so a slow lookup never holds the app up. */
export async function PolicyGate({ employeeId }: { employeeId: string }) {
  const documents = await pendingPolicies(employeeId);
  if (documents.length === 0) return null;
  return <PolicyAcknowledgementDialog documents={documents} />;
}
