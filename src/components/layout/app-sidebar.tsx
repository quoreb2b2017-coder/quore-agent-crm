"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ADMIN_GROUP_ORDER,
  EMPLOYEE_GROUP_ORDER,
  MODULE_GROUP_LABELS,
  type ModuleDefinition,
} from "@/lib/permissions/modules";
import { NavItemGlyph } from "@/components/layout/route-loading";
import { cn } from "@/lib/utils";

export function AppSidebar({
  modules,
  brand,
  badges,
  mfaEnabled,
  securityHref,
}: {
  modules: ModuleDefinition[];
  brand: "admin" | "employee";
  badges: Record<string, number>;
  mfaEnabled: boolean;
  securityHref: string;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const order = brand === "admin" ? ADMIN_GROUP_ORDER : EMPLOYEE_GROUP_ORDER;
  const sections = order
    .map((group) => ({
      group,
      label: MODULE_GROUP_LABELS[group],
      items: modules.filter((mod) => mod.group === group),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="gap-0 px-2 pt-2 pb-3">
        {sections.map((section) => (
          <SidebarGroup key={section.group} className="p-0 pt-3">
            <SidebarGroupLabel className="mb-0.5 h-6 px-2.5 text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {section.items.map((mod) => {
                  const isActive = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
                  const badge = badges[mod.key] ?? 0;
                  return (
                    <SidebarMenuItem key={mod.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={mod.label}
                        className={cn(
                          "h-9 gap-2.5 rounded-md px-2.5 text-[13.5px] text-sidebar-foreground hover:bg-muted hover:text-foreground",
                          isActive &&
                            "bg-sidebar-accent font-semibold text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                        )}
                      >
                        <Link
                          href={mod.href}
                          prefetch
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <span className="relative flex size-4 items-center justify-center">
                            <NavItemGlyph name={mod.icon} />
                          </span>
                          <span>{mod.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badge > 0 ? (
                        <SidebarMenuBadge className="rounded-full bg-mint-soft px-1.5 text-[11px] font-semibold text-primary">
                          {badge > 99 ? "99+" : badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:hidden">
        <Link
          href={securityHref}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-snug transition",
            mfaEnabled
              ? "border-[#abefc6] bg-[#ecfdf3] text-[#067647] hover:bg-[#dcfae6]"
              : "border-[#fecdca] bg-[#fef3f2] text-[#b42318] hover:bg-[#fee4e2]"
          )}
        >
          <span className={cn("mt-1 size-2 shrink-0 rounded-full", mfaEnabled ? "bg-[#17b26a]" : "bg-[#f04438]")} aria-hidden />
          <span>
            <span className="block font-semibold">{mfaEnabled ? "Two-factor sign-in on" : "Two-factor sign-in off"}</span>
            <span className="block opacity-90">{mfaEnabled ? "Your account is protected." : "Turn it on to protect your account."}</span>
          </span>
        </Link>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
