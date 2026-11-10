"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { POLICY_DOCUMENTS } from "@/lib/policies";
import { createServiceClient } from "@/lib/supabase/service";

/** Records that the signed-in person read this version of the document. Asking twice is harmless. */
export async function acknowledgePolicy(documentKey: string, version: string): Promise<{ error?: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  const document = POLICY_DOCUMENTS.find(
    (item) => item.live && item.key === documentKey && item.version === version
  );
  if (!document) return { error: "That document has changed. Reload the page and read the new version." };

  const { error } = await createServiceClient()
    .from("policy_acknowledgements")
    .upsert(
      { employee_id: ctx.employeeId, document_key: document.key, version: document.version },
      { onConflict: "employee_id,document_key,version", ignoreDuplicates: true }
    );
  if (error) {
    return {
      error: /policy_acknowledgements/i.test(error.message)
        ? "This is not set up yet. Ask Super Admin to run migration 0044."
        : error.message,
    };
  }
  revalidatePath("/", "layout");
  return {};
}
