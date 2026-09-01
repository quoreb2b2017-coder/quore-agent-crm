"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SessionPresence } from "@/components/layout/session-presence";
import { AppSocketProvider } from "@/components/realtime/app-socket";
import { NavigationLoader } from "@/components/layout/route-loading";
import { PermissionsProvider } from "@/lib/permissions/context";
import { isSuperAdmin } from "@/lib/permissions/roles";
import type { ModuleDefinition } from "@/lib/permissions/modules";
import type { EmployeeContext } from "@/lib/permissions/types";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AppShell({
  modules,
  brand,
  ctx,
  profileHref,
  notificationsHref,
  children,
}: {
  modules: ModuleDefinition[];
  groupLabel?: string;
  brand: "admin" | "employee";
  ctx: EmployeeContext;
  profileHref: string;
  notificationsHref: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isChat = pathname === "/admin/chat" || pathname === "/portal/chat";
  const chatHref = brand === "admin" ? "/admin/chat" : "/portal/chat";

  return (
    <PermissionsProvider value={ctx}>
      <AppSocketProvider employeeId={ctx.employeeId}>
        <SidebarProvider
          style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
        >
          <AppSidebar modules={modules} brand={brand} ctx={ctx} />
          <SidebarInset className="bg-app-canvas max-h-svh overflow-hidden">
            <SessionPresence enableClockIn={!isSuperAdmin(ctx.roleKey)} />
            <Topbar
              modules={modules}
              ctx={ctx}
              profileHref={profileHref}
              notificationsHref={notificationsHref}
              chatHref={chatHref}
            />
            <div className="relative min-h-0 flex-1">
              <NavigationLoader />
              <div
                className={cn(
                  "h-full min-h-0",
                  isChat ? "overflow-hidden" : "overflow-y-auto px-4 pt-1 pb-8 md:px-8"
                )}
              >
                <div className={cn(isChat && "h-full min-h-0")}>{children}</div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AppSocketProvider>
    </PermissionsProvider>
  );
}
