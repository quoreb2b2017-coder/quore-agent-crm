import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getEmployeeContextIncludingBlocked, isAdminLike } from "@/lib/permissions/server";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { isEmploymentBlocked } from "@/lib/format";

export default async function Home() {
  // Verified identity only (finding F-01): never trust getSession() on the server.
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const ctx = await getEmployeeContextIncludingBlocked();
  if (!ctx) {
    return <AccountSetupNotice email={user.email ?? ""} />;
  }

  if (isEmploymentBlocked(ctx.employmentStatus)) {
    return <BlockedAccountGate />;
  }

  redirect(isAdminLike(ctx.roleKey) ? "/admin/dashboard" : "/portal/dashboard");
}
