import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isManagement } from "@/lib/permissions/roles";
import { MFA_ENFORCED } from "@/lib/auth/mfa-flags";

/**
 * Second-factor status for the signed-in user, checked against auth.mfa_factors
 * on the server (the browser cookie's copy of the user is not trusted).
 */
export const getMfaStatus = cache(async () => {
  // TEMP: 2FA paused — skip factor lookup until MFA_ENFORCED is turned back on.
  if (!MFA_ENFORCED) return { enrolled: false, aal: "aal1" as const };
  const claims = await getVerifiedClaims();
  if (!claims) return { enrolled: false, aal: "aal1" as const };
  const aal = claims.aal === "aal2" ? ("aal2" as const) : ("aal1" as const);
  if (aal === "aal2") return { enrolled: true, aal };
  const { data, error } = await createServiceClient().rpc("has_verified_mfa", { p_user_id: claims.sub });
  return { enrolled: !error && data === true, aal };
});

/**
 * Users with a verified factor must complete it on every sign-in before any
 * page loads (the session must be AAL2). Super Admin and HR without a factor
 * get a persistent banner until they enrol.
 *
 * TEMP: when MFA_ENFORCED is false, never redirect to /verify and never require enrol.
 */
export async function enforceMfa(roleKey: string) {
  // if (!MFA_ENFORCED) — two-factor off for now
  if (!MFA_ENFORCED) {
    return { mfaEnabled: false, mfaRequired: false };
  }
  const status = await getMfaStatus();
  if (status.enrolled && status.aal !== "aal2") redirect("/verify");
  const privileged = isManagement(roleKey);
  return { mfaEnabled: status.enrolled, mfaRequired: privileged && !status.enrolled };
}
