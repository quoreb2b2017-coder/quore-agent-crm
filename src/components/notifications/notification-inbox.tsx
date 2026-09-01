"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bell, CheckCheck, Loader2, LogIn, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDay, formatRelativeTime } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

export type InboxNotification = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  isRead: boolean;
  type?: string;
};

function typeMeta(type?: string) {
  if (type === "EMPLOYEE_LOGIN") {
    return { label: "Login", Icon: LogIn, tone: "bg-emerald-500/10 text-emerald-700" };
  }
  if (type === "ADMIN_ANNOUNCEMENT") {
    return { label: "Announcement", Icon: Megaphone, tone: "bg-sky-500/10 text-sky-700" };
  }
  return { label: "Alert", Icon: Bell, tone: "bg-primary/10 text-primary" };
}

export function NotificationInbox({
  initialItems,
  canMarkAll = true,
}: {
  initialItems: InboxNotification[];
  canMarkAll?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const unread = useMemo(() => items.filter((item) => !item.isRead).length, [items]);
  const groups = useMemo(() => {
    const map = new Map<string, InboxNotification[]>();
    for (const item of items) {
      const label = formatRelativeDay(item.createdAt);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [items]);

  function markOne(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );
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
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-20 text-center shadow-sm">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Bell className="size-6" />
        </span>
        <p className="text-base font-semibold tracking-tight">You're all caught up</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Login alerts and messages will appear here as they arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-semibold tracking-tight">Inbox</p>
          {unread > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {unread} unread
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">All caught up</span>
          )}
        </div>
        {canMarkAll && unread > 0 ? (
          <Button variant="ghost" size="sm" disabled={isPending} onClick={markAll}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="divide-y">
        {groups.map(([label, rows]) => (
          <section key={label}>
            <h3 className="bg-muted/40 px-5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {label}
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
                        "flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
                        !item.isRead && "bg-primary/[0.035]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                          meta.tone
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className={cn("text-sm leading-5", !item.isRead && "font-semibold")}>
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </span>
                        {item.body ? (
                          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">
                            {item.body}
                          </span>
                        ) : null}
                        <span className="mt-1.5 inline-flex">
                          <Badge variant="outline" className="h-5 border-border/80 px-1.5 text-[10px] font-medium text-muted-foreground">
                            {meta.label}
                          </Badge>
                        </span>
                      </span>
                      {!item.isRead ? (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-2 size-2 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
