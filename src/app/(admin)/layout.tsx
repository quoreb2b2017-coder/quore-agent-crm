import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getCurrentEmployeeContext, isAdminLike } from "@/lib/permissions/server";
import { ADMIN_MODULES, filterModules } from "@/lib/permissions/modules";
import { AppShell } from "@/components/layout/app-shell";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { DashboardPageSkeleton } from "@/components/layout/page-skeleton";
import { isEmploymentBlocked } from "@/lib/format";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentEmployeeContext();

  if (!ctx) {
    const user = await getAuthUser();
    if (!user) redirect("/login");
    return <AccountSetupNotice email={user.email ?? ""} />;
  }

  if (isEmploymentBlocked(ctx.employmentStatus)) {
    return <BlockedAccountGate />;
  }

  if (!isAdminLike(ctx.roleKey)) {
    redirect("/portal/dashboard");
  }

  const modules = filterModules(ADMIN_MODULES, ctx);
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      modules={modules}
      groupLabel="Administration"
      brand="admin"
      ctx={ctx}
      profileHref="/admin/settings"
      notificationsHref="/admin/notifications"
      defaultSidebarOpen={sidebarOpen}
    >
      <Suspense fallback={<DashboardPageSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}
