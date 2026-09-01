import { redirect } from "next/navigation";
import { getCurrentEmployeeContext, isAdminLike } from "@/lib/permissions/server";
import { ADMIN_MODULES, filterModules } from "@/lib/permissions/modules";
import { AppShell } from "@/components/layout/app-shell";
import { BlockedAccountGate } from "@/components/auth/blocked-account-gate";
import { isEmploymentBlocked } from "@/lib/format";

export default async function AdminLayout({
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

  if (!isAdminLike(ctx.roleKey)) {
    redirect("/portal/dashboard");
  }

  const modules = filterModules(ADMIN_MODULES, ctx);

  return (
    <AppShell
      modules={modules}
      groupLabel="Administration"
      brand="admin"
      ctx={ctx}
      profileHref="/admin/settings"
      notificationsHref="/admin/notifications"
    >
      {children}
    </AppShell>
  );
}
