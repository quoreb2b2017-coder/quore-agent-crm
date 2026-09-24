import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { EMPLOYEE_MODULES, filterModules } from "@/lib/permissions/modules";
import { AppShell } from "@/components/layout/app-shell";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { DashboardPageSkeleton } from "@/components/layout/page-skeleton";
import { isEmploymentBlocked } from "@/lib/format";

export default async function EmployeeLayout({
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

  const modules = filterModules(EMPLOYEE_MODULES, ctx);

  return (
    <AppShell
      modules={modules}
      groupLabel="My Workspace"
      brand="employee"
      ctx={ctx}
      profileHref="/portal/profile"
      notificationsHref="/portal/notifications"
    >
      <Suspense fallback={<DashboardPageSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}
