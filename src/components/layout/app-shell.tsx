"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppBar } from "@/components/layout/app-bar";
import { CommandPalette, type PaletteAction } from "@/components/layout/command-palette";
import { SessionPresence } from "@/components/layout/session-presence";
import { AppSocketProvider } from "@/components/realtime/app-socket";
import { EnablePushNotifications } from "@/components/notifications/enable-push-notifications";
import { NavigationLoader } from "@/components/layout/route-loading";
import { PermissionsProvider } from "@/lib/permissions/context";
import { isManagement } from "@/lib/permissions/roles";
import type { ModuleDefinition } from "@/lib/permissions/modules";
import type { EmployeeContext } from "@/lib/permissions/types";
import { cn } from "@/lib/utils";

export function AppShell({
  modules,
  brand,
  ctx,
  companyName,
  approvalsCount,
  mfaEnabled,
  mfaRequired,
  paletteActions,
  defaultSidebarOpen = true,
  children,
}: {
  modules: ModuleDefinition[];
  brand: "admin" | "employee";
  ctx: EmployeeContext;
  companyName: string;
  approvalsCount: number | null;
  mfaEnabled: boolean;
  /** Privileged role without a second factor: show a persistent banner. */
  mfaRequired: boolean;
  paletteActions: PaletteAction[];
  defaultSidebarOpen?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const base = brand === "admin" ? "/admin" : "/portal";
  const isChat = pathname === `${base}/chat`;
  const securityHref = `${base}/security`;

  return (
    <PermissionsProvider value={ctx}>
      <AppSocketProvider employeeId={ctx.employeeId}>
        <SidebarProvider
          defaultOpen={defaultSidebarOpen}
          className="h-svh min-h-0 flex-col overflow-hidden"
          style={{ "--sidebar-width": "15rem", "--app-bar-h": "3.5rem" } as CSSProperties}
        >
          <AppBar
            ctx={ctx}
            companyName={companyName}
            homeHref={`${base}/dashboard`}
            profileHref={brand === "admin" ? "/admin/settings" : "/portal/profile"}
            securityHref={securityHref}
            notificationsHref={`${base}/notifications`}
            chatHref={`${base}/chat`}
            approvals={approvalsCount != null ? { count: approvalsCount, href: "/admin/approvals" } : null}
          />
          <CommandPalette modules={modules} actions={paletteActions} canSearchPeople={isManagement(ctx.roleKey)} />
          <div className="flex min-h-0 flex-1">
            <AppSidebar
              modules={modules}
              brand={brand}
              badges={approvalsCount ? { approvals: approvalsCount } : {}}
              mfaEnabled={mfaEnabled}
              securityHref={securityHref}
            />
            <SidebarInset className="bg-app-canvas min-h-0 overflow-hidden">
              <SessionPresence enableClockIn={!isManagement(ctx.roleKey)} />
              <EnablePushNotifications />
              {mfaRequired && pathname !== securityHref ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#fecdca] bg-[#fef3f2] px-4 py-2 text-[13px] text-[#7a271a] md:px-8">
                  <ShieldAlert className="size-4 shrink-0 text-[#b42318]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    Your role can see salaries and personal data. Two-factor sign-in is required for it (ISO A.8.5, SOC 2 CC6.1).
                  </span>
                  <Link href={securityHref} className="font-semibold text-[#b42318] underline-offset-2 hover:underline">
                    Turn it on now
                  </Link>
                </div>
              ) : null}
              <div className="relative min-h-0 flex-1">
                <NavigationLoader />
                <div className={cn("h-full min-h-0", isChat ? "overflow-hidden" : "overflow-y-auto px-4 pt-5 pb-10 md:px-8")}>
                  <div className={cn(isChat ? "h-full min-h-0" : "mx-auto w-full max-w-[1320px]")}>{children}</div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </AppSocketProvider>
    </PermissionsProvider>
  );
}
