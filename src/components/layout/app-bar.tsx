"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Fingerprint, Inbox, Loader2, LogOut, Search, User } from "lucide-react";
import { toast } from "sonner";
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
import { DualOfficeClocks } from "@/components/layout/live-time";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatUnreadButton } from "@/components/chat/chat-unread-button";
import { openCommandPalette } from "@/components/layout/command-palette";
import { createClient } from "@/lib/supabase/client";
import { endWorkSession } from "@/lib/actions/attendance";
import type { EmployeeContext } from "@/lib/permissions/types";

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppBar({
  ctx,
  companyName,
  homeHref,
  profileHref,
  securityHref,
  notificationsHref,
  chatHref,
  approvals,
}: {
  ctx: EmployeeContext;
  companyName: string;
  homeHref: string;
  profileHref: string;
  securityHref: string;
  notificationsHref: string;
  chatHref: string;
  approvals: { count: number; href: string } | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(true);
    toast.loading("Logging out...", { id: "logout" });
    try {
      sessionStorage.removeItem("worktrack-session-started");
      await Promise.race([
        endWorkSession().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
      await createClient().auth.signOut();
      window.location.assign("/login");
    } catch {
      toast.error("Could not log out. Try again.", { id: "logout" });
      setLoggingOut(false);
    }
  }

  return (
    <header className="wt-appbar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-ink px-3 text-ink-foreground md:gap-3 md:px-4">
      <SidebarTrigger className="text-ink-foreground hover:bg-ink-panel hover:text-white" />
      <Link href={homeHref} className="flex shrink-0 items-center gap-2.5 rounded-md text-white outline-none focus-visible:ring-2 focus-visible:ring-mint">
        <span className="flex size-7 items-center justify-center rounded-[7px] bg-mint text-sm font-bold text-ink">Q</span>
        <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">WorkTrack</span>
      </Link>
      <span className="hidden h-8 items-center gap-2 rounded-md border border-ink-border bg-ink-panel px-2.5 text-[12.5px] lg:inline-flex">
        <span className="size-1.5 rounded-full bg-mint" aria-hidden />
        {companyName}
      </span>

      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-auto flex h-9 w-full max-w-[480px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-ink-border bg-ink-panel px-3 text-left text-sm text-ink-muted transition hover:border-[#2e5149] focus-visible:ring-2 focus-visible:ring-mint focus-visible:outline-none"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search or jump to…</span>
        <kbd className="hidden rounded border border-[#2e5149] px-1.5 font-mono text-[11px] text-ink-foreground sm:inline">⌘K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <DualOfficeClocks pills className="hidden xl:flex" />
        {approvals ? (
          <Link
            href={approvals.href}
            className="hidden h-8 items-center gap-2 rounded-md bg-mint px-2.5 text-[12.5px] font-semibold text-ink transition hover:brightness-105 md:inline-flex"
          >
            <Inbox className="size-3.5" aria-hidden />
            Approvals
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[11px] text-mint">
              {approvals.count > 99 ? "99+" : approvals.count}
            </span>
          </Link>
        ) : null}
        <ChatUnreadButton href={chatHref} />
        <NotificationBell href={notificationsHref} />
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            if (!loggingOut) setMenuOpen(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2 rounded-lg px-1.5 text-white hover:bg-ink-panel hover:text-white"
              disabled={loggingOut}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-[#1e4a41] text-[11px] font-semibold text-mint">
                {initials(ctx.fullName)}
              </span>
              <span className="hidden flex-col text-left leading-tight md:flex">
                <span className="max-w-[9rem] truncate text-[13px] font-medium">{ctx.fullName}</span>
                <span className="max-w-[9rem] truncate text-[11px] font-normal text-ink-muted">{ctx.roleDisplayName}</span>
              </span>
              <ChevronDown className="hidden size-3.5 text-ink-muted md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
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
            <DropdownMenuItem asChild>
              <Link href={securityHref}>
                <Fingerprint className="size-4" />
                Account security
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={loggingOut}
              onSelect={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              {loggingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {loggingOut ? "Logging out..." : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
