"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createDataClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Removes every second factor for an employee who lost their phone, and signs
 * them out everywhere. Super Admin only, never on their own account; recorded
 * in the audit log as a change to the employee record.
 */
export async function resetEmployeeMfa(employeeId: string): Promise<{ error?: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Only Super Admin can reset two-factor sign-in." };
  if (employeeId === ctx.employeeId) return { error: "You cannot reset your own two-factor sign-in. Ask another Super Admin." };

  const service = createServiceClient();
  const { data: employee } = await service.from("employees").select("auth_user_id").eq("id", employeeId).maybeSingle();
  if (!employee?.auth_user_id) return { error: "This employee has no sign-in account." };

  const { data: factors, error: listError } = await service.auth.admin.mfa.listFactors({ userId: employee.auth_user_id });
  if (listError) return { error: listError.message };
  for (const factor of factors?.factors ?? []) {
    const { error } = await service.auth.admin.mfa.deleteFactor({ userId: employee.auth_user_id, id: factor.id });
    if (error) return { error: error.message };
  }
  await service.auth.admin.signOut(employee.auth_user_id, "global").catch(() => undefined);

  await (await createDataClient()).rpc("log_security_event", {
    p_employee_id: employeeId,
    p_action: "MFA_RESET",
    p_details: { factors_removed: (factors?.factors ?? []).length, sessions_revoked: true },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return {};
}
