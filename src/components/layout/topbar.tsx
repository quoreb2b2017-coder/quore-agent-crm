"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DualOfficeClocks } from "@/components/layout/live-time";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatUnreadButton } from "@/components/chat/chat-unread-button";
import { createClient } from "@/lib/supabase/client";
import { endWorkSession } from "@/lib/actions/attendance";
import type { EmployeeContext } from "@/lib/permissions/types";
import type { ModuleDefinition } from "@/lib/permissions/modules";

function pageTitle(pathname: string, modules: ModuleDefinition[]) {
  if (pathname.includes("/notifications")) return "Notifications";
  const match = modules.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`)
  );
  if (match) return match.label;
  const last = pathname.split("/").filter(Boolean).pop() ?? "Dashboard";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Topbar({
  modules,
  ctx,
  profileHref,
  notificationsHref,
  chatHref,
}: {
  modules: ModuleDefinition[];
  ctx: EmployeeContext;
  profileHref: string;
  notificationsHref: string;
  chatHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const title = pageTitle(pathname, modules);

  async function handleLogout() {
    sessionStorage.removeItem("worktrack-session-started");
    await endWorkSession();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/75 px-4 backdrop-blur-xl md:px-8">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium tracking-tight">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <DualOfficeClocks pills />
        <ChatUnreadButton href={chatHref} />
        <NotificationBell href={notificationsHref} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 rounded-full px-1.5 hover:bg-muted"
            >
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                  {initials(ctx.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[9rem] truncate text-[13px] font-medium sm:inline">
                {ctx.fullName}
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{ctx.fullName}</span>
                <span className="text-xs font-normal text-muted-foreground">{ctx.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={profileHref}>
                <User className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
