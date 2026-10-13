"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bell, CheckCheck, Loader2, LogIn, Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatTimeInZone, formatRelativeDay } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { getWorkSettings } from "@/lib/work-settings";
import { cn } from "@/lib/utils";

export type InboxNotification = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  isRead: boolean;
  type?: string;
};

type Filter = "all" | "unread" | "login" | "meeting" | "announcement";

function typeMeta(type?: string) {
  if (type === "EMPLOYEE_LOGIN") {
    return { label: "Login", Icon: LogIn, tone: "bg-success/10 text-success", group: "login" as const };
  }
  if (type === "MEETING_REQUEST" || type === "MEETING_ACCEPTED" || type === "MEETING_REJECTED") {
    const tone =
      type === "MEETING_REJECTED" ? "bg-warning/15 text-warning-foreground" : "bg-info/10 text-info";
    return { label: "Meeting", Icon: Users, tone, group: "meeting" as const };
  }
  if (type === "ADMIN_ANNOUNCEMENT") {
    return { label: "Note", Icon: Megaphone, tone: "bg-primary/10 text-primary", group: "announcement" as const };
  }
  return { label: "Alert", Icon: Bell, tone: "bg-muted text-muted-foreground", group: "all" as const };
}

function whenLabel(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 24 * 60) return formatRelativeTime(value);
  return formatTimeInZone(date, getWorkSettings().timeZone);
}

export function NotificationInbox({
  initialItems,
  canMarkAll = true,
}: {
  initialItems: InboxNotification[];
  canMarkAll?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const unread = useMemo(() => items.filter((item) => !item.isRead).length, [items]);
  const counts = useMemo(() => {
    return {
      all: items.length,
      unread,
      login: items.filter((item) => typeMeta(item.type).group === "login").length,
      meeting: items.filter((item) => typeMeta(item.type).group === "meeting").length,
      announcement: items.filter((item) => typeMeta(item.type).group === "announcement").length,
    };
  }, [items, unread]);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (filter === "unread") return !item.isRead;
      if (filter === "all") return true;
      return typeMeta(item.type).group === filter;
    });
  }, [items, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, InboxNotification[]>();
    for (const item of visible) {
      const label = formatRelativeDay(item.createdAt);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [visible]);

  function markOne(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    startTransition(async () => {
      await markNotificationRead(id);
    });
    window.dispatchEvent(new Event("worktrack:notifications-changed"));
  }

  function markAll() {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    startTransition(async () => {
      await markAllNotificationsRead();
    });
    window.dispatchEvent(new Event("worktrack:notifications-changed"));
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bell className="size-4" />
        </span>
        <p className="text-sm font-semibold">You&apos;re all caught up</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Login alerts and messages will show up here.
        </p>
      </div>
    );
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "unread", label: "Unread", count: counts.unread },
    { id: "login", label: "Login", count: counts.login },
    { id: "meeting", label: "Meeting", count: counts.meeting },
    { id: "announcement", label: "Notes", count: counts.announcement },
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {filters
            .filter((item) => item.id === "all" || item.id === "unread" || item.count > 0)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  filter === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                <span className="ml-1 tabular-nums opacity-80">{item.count}</span>
              </button>
            ))}
        </div>
        {canMarkAll && unread > 0 ? (
          <Button variant="ghost" size="sm" disabled={isPending} onClick={markAll}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
            Mark all read
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nothing in this filter.</p>
      ) : (
        <div>
          {groups.map(([label, rows]) => (
            <section key={label}>
              <h3 className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {label}
                <span className="ml-1.5 tabular-nums">{rows.length}</span>
              </h3>
              <ul>
                {rows.map((item) => {
                  const meta = typeMeta(item.type);
                  const Icon = meta.Icon;
                  return (
                    <li key={item.id} className="border-t first:border-t-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.isRead) markOne(item.id);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40",
                          !item.isRead && "bg-primary/[0.04]"
                        )}
                      >
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn("truncate text-sm", !item.isRead && "font-semibold")}>{item.title}</span>
                            <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {meta.label}
                            </span>
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.body}</span>
                          ) : null}
                        </span>
                        <time className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {whenLabel(item.createdAt)}
                        </time>
                        <span
                          className={cn("size-1.5 shrink-0 rounded-full", item.isRead ? "bg-transparent" : "bg-primary")}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
