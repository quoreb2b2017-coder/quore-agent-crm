import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { postLoginPath, readWorktrackJwtClaims } from "@/lib/auth/jwt-claims";
import { getCurrentEmployeeContext, isAdminLike } from "@/lib/permissions/server";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { isEmploymentBlocked } from "@/lib/format";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const claims = readWorktrackJwtClaims(session.access_token);
  if (claims.roleKey) {
    if (claims.employmentStatus && isEmploymentBlocked(claims.employmentStatus)) {
      return <BlockedAccountGate />;
    }
    redirect(postLoginPath(claims.roleKey));
  }

  const ctx = await getCurrentEmployeeContext();
  if (!ctx) {
    return <AccountSetupNotice email={session.user.email ?? ""} />;
  }

  if (isEmploymentBlocked(ctx.employmentStatus)) {
    return <BlockedAccountGate />;
  }

  redirect(isAdminLike(ctx.roleKey) ? "/admin/dashboard" : "/portal/dashboard");
}
