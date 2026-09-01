import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getCurrentEmployeeContext, isAdminLike } from "@/lib/permissions/server";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { isEmploymentBlocked } from "@/lib/format";

export default async function Home() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const ctx = await getCurrentEmployeeContext();
  if (!ctx) {
    return <AccountSetupNotice email={user.email ?? ""} />;
  }

  if (isEmploymentBlocked(ctx.employmentStatus)) {
    return <BlockedAccountGate />;
  }

  redirect(isAdminLike(ctx.roleKey) ? "/admin/dashboard" : "/portal/dashboard");
}
