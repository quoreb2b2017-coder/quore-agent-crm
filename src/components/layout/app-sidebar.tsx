"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Users2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  MODULE_GROUP_LABELS,
  type ModuleDefinition,
  type ModuleGroup,
} from "@/lib/permissions/modules";
import type { EmployeeContext } from "@/lib/permissions/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavItemGlyph } from "@/components/layout/route-loading";
import { cn } from "@/lib/utils";

const ADMIN_GROUP_ORDER: ModuleGroup[] = [
  "overview",
  "operations",
  "hr",
  "account",
];

const EMPLOYEE_GROUP_ORDER: ModuleGroup[] = ["overview", "work", "time", "account"];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppSidebar({
  modules,
  brand,
  ctx,
}: {
  modules: ModuleDefinition[];
  groupLabel?: string;
  brand: "admin" | "employee";
  ctx: EmployeeContext;
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 pb-2">
        <Link
          href={brand === "admin" ? "/admin/dashboard" : "/portal/dashboard"}
          className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 outline-none ring-sidebar-ring focus-visible:ring-2"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-sky-200 to-white text-sidebar shadow-sm">
            {brand === "admin" ? (
              <ShieldCheck className="size-4" />
            ) : (
              <Users2 className="size-4" />
            )}
          </div>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-[15px] font-semibold tracking-tight text-white">
              WorkTrack
            </span>
            <span className="truncate text-[11px] text-white/45">
              {ctx.roleDisplayName}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2.5 pt-1 pb-3">
        {sections.map((section) => (
          <SidebarGroup key={section.group} className="p-0 pt-3">
            <SidebarGroupLabel className="mb-1 h-6 px-2.5 text-[10px] font-medium tracking-[0.16em] text-white/35 uppercase">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((mod) => {
                  const isActive =
                    pathname === mod.href || pathname.startsWith(`${mod.href}/`);
                  return (
                    <SidebarMenuItem key={mod.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={mod.label}
                        className={cn(
                          "h-9 gap-2.5 rounded-lg px-2 text-[13px] text-white/65 hover:bg-white/8 hover:text-white",
                          isActive &&
                            "bg-white font-medium text-sidebar shadow-sm hover:bg-white hover:text-sidebar data-active:bg-white data-active:text-sidebar data-active:hover:bg-white data-active:hover:text-sidebar"
                        )}
                      >
                        <Link
                          href={mod.href}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <span
                            className={cn(
                              "relative flex size-6 items-center justify-center rounded-md",
                              isActive ? "bg-sidebar/8" : "bg-white/6"
                            )}
                          >
                            <NavItemGlyph name={mod.icon} />
                          </span>
                          <span>{mod.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Link
          href={brand === "admin" ? "/admin/settings" : "/portal/profile"}
          className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/5 px-2 py-2 outline-none ring-sidebar-ring transition hover:bg-white/8 focus-visible:ring-2"
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-white/15 text-[11px] font-semibold text-white">
              {initials(ctx.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-medium text-white">{ctx.fullName}</span>
            <span className="truncate text-[11px] text-white/40">{ctx.employeeCode}</span>
          </div>
        </Link>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
