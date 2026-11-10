import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getEmployeeContextIncludingBlocked } from "@/lib/permissions/server";
import { EMPLOYEE_MODULES, filterModules } from "@/lib/permissions/modules";
import { AppShell } from "@/components/layout/app-shell";
import { AccountSetupNotice } from "@/components/auth/account-setup-notice";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { DashboardPageSkeleton } from "@/components/layout/page-skeleton";
import { TodayCelebrations } from "@/components/celebrations/today-celebrations";
import { PolicyGate } from "@/components/policies/policy-gate";
import { isEmploymentBlocked } from "@/lib/format";
import { loadShell } from "@/lib/shell";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getEmployeeContextIncludingBlocked();

  if (!ctx) {
    const user = await getAuthUser();
    if (!user) redirect("/login");
    return <AccountSetupNotice email={user.email ?? ""} />;
  }

  if (isEmploymentBlocked(ctx.employmentStatus)) {
    return <BlockedAccountGate />;
  }

  const modules = filterModules(EMPLOYEE_MODULES, ctx);
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const shell = await loadShell(ctx, "employee");

  return (
    <AppShell
      modules={modules}
      brand="employee"
      ctx={ctx}
      companyName={shell.companyName}
      approvalsCount={shell.approvalsCount}
      mfaEnabled={shell.mfaEnabled}
      mfaRequired={shell.mfaRequired}
      paletteActions={shell.paletteActions}
      defaultSidebarOpen={sidebarOpen}
    >
      <Suspense fallback={<DashboardPageSkeleton />}>{children}</Suspense>
      <Suspense fallback={null}>
        <TodayCelebrations viewerId={ctx.employeeId} />
      </Suspense>
      <Suspense fallback={null}>
        <PolicyGate employeeId={ctx.employeeId} />
      </Suspense>
    </AppShell>
  );
}
