"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import { getNotificationBellState, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";
import type { RecentNotification } from "@/lib/realtime/types";

export function NotificationBell({ href }: { href: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<RecentNotification[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const state = await getNotificationBellState();
    setUnreadCount(state.unreadCount);
    setRecent(state.recent);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 900);
    function onPing() {
      setUnreadCount((count) => count + 1);
      void load();
    }
    window.addEventListener("worktrack:notification", onPing);
    window.addEventListener("worktrack:notifications-changed", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("worktrack:notification", onPing);
      window.removeEventListener("worktrack:notifications-changed", load);
    };
  }, [load]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 rounded-full text-muted-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] overflow-hidden p-0">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <span className="text-[11px] font-medium text-muted-foreground">{unreadCount} unread</span>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {recent.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">No notifications yet</p>
        ) : (
          recent.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="items-start gap-2.5 rounded-none px-3.5 py-2.5"
              disabled={isPending}
              onSelect={() => {
                if (item.isRead) return;
                setRecent((rows) =>
                  rows.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
                );
                setUnreadCount((count) => Math.max(0, count - 1));
                startTransition(async () => {
                  await markNotificationRead(item.id);
                });
              }}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  item.isRead ? "bg-muted-foreground/25" : "bg-primary"
                )}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", !item.isRead && "font-medium")}>
                  {item.title}
                </span>
                {item.body ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">
                    {item.body}
                  </span>
                ) : null}
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="justify-center rounded-none py-2.5 text-sm font-medium">
          <Link href={href}>View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
