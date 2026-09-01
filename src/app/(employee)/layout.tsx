import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { EMPLOYEE_MODULES, filterModules } from "@/lib/permissions/modules";
import { AppShell } from "@/components/layout/app-shell";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { isEmploymentBlocked } from "@/lib/format";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentEmployeeContext();

  if (!ctx) {
    redirect("/login");
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
      {children}
    </AppShell>
  );
}
