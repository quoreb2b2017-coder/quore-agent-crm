"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2, LogIn, Megaphone, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime, formatTimeInZone, formatRelativeDay } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
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

export function typeMeta(type?: string) {
  if (type === "EMPLOYEE_LOGIN") {
    return { label: "Login", Icon: LogIn, tone: "bg-success/10 text-success", group: "login" as const };
  }
  if (type === "MEETING_REQUEST" || type === "MEETING_ACCEPTED" || type === "MEETING_REJECTED") {
    const tone = type === "MEETING_REJECTED" ? "bg-warning/15 text-warning" : "bg-info/10 text-info";
    return { label: "Meeting", Icon: Users, tone, group: "meeting" as const };
  }
  if (type === "ADMIN_ANNOUNCEMENT") {
    return { label: "Note", Icon: Megaphone, tone: "bg-primary/10 text-primary", group: "announcement" as const };
  }
  return { label: "Alert", Icon: Bell, tone: "bg-muted text-muted-foreground", group: "all" as const };
}

/** Login and meeting alerts name the employee in their text: "Anis logged in", "Anis (1007) signed in...". */
function personFrom(item: InboxNotification) {
  const match = /^(.+) (logged in|requested a meeting)$/.exec(item.title);
  if (!match) return null;
  const activity = match[2] === "logged in" ? "Logged in" : "Requested a meeting";
  const code = item.body ? /\(([^)]+)\)/.exec(item.body)?.[1] : undefined;
  return { name: match[1], code: code ?? "—", activity };
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
  employeeIdByName = {},
}: {
  initialItems: InboxNotification[];
  canMarkAll?: boolean;
  /** Makes names in the list open that employee. Admin only. */
  employeeIdByName?: Record<string, string>;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
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

  const showPeople = useMemo(() => items.some((item) => personFrom(item)), [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (needle && !`${item.title} ${item.body ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "unread") return !item.isRead;
      if (filter === "all") return true;
      return typeMeta(item.type).group === filter;
    });
  }, [items, filter, query]);

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
      <div className="flex flex-col items-center justify-center border bg-card px-6 py-16 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
    <div className="border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or message"
              aria-label="Search notifications"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-sm bg-card pl-8"
            />
          </div>
          <div className="inline-flex flex-wrap divide-x rounded-sm border bg-card">
            {filters
              .filter((item) => item.id === "all" || item.id === "unread" || item.count > 0)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "inline-flex h-[calc(2rem-2px)] items-center gap-1.5 px-3 text-xs font-semibold transition-colors",
                    filter === item.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {item.label}
                  <span className="tabular-nums">{item.count}</span>
                </button>
              ))}
          </div>
        </div>
        {canMarkAll && unread > 0 ? (
          <Button variant="outline" size="sm" className="rounded-sm bg-card" disabled={isPending} onClick={markAll}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
            Mark all read
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nothing in this filter.</p>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-16rem)] [&>[data-slot=table-container]]:min-h-64">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {showPeople ? (
                  <>
                    <TableHead className={sheetHeadClassName}>Name</TableHead>
                    <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                  </>
                ) : null}
                <TableHead className={cn(sheetHeadClassName, "w-24")}>Type</TableHead>
                <TableHead className={sheetHeadClassName}>Notification</TableHead>
                <TableHead className={sheetHeadClassName}>Message</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-28")}>Time</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-20 border-r-0")}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(([label, rows]) => (
                <Fragment key={label}>
                  <TableRow className="bg-secondary hover:bg-secondary">
                    <TableCell
                      colSpan={showPeople ? 7 : 5}
                      className={cn(
                        sheetCellClassName,
                        "h-8 border-r-0 text-[11px] font-bold tracking-wider uppercase"
                      )}
                    >
                      {label} · {rows.length}
                    </TableCell>
                  </TableRow>
                  {rows.map((item) => {
                    const meta = typeMeta(item.type);
                    const Icon = meta.Icon;
                    const person = personFrom(item);
                    const personId = person ? employeeIdByName[person.name] : undefined;
                    const heading = person?.activity ?? item.title;
                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          sheetRowClassName,
                          !item.isRead && "cursor-pointer bg-accent/60 even:bg-accent/60"
                        )}
                        onClick={() => {
                          if (!item.isRead) markOne(item.id);
                        }}
                      >
                        {showPeople ? (
                          <>
                            <TableCell
                              className={cn(
                                sheetCellClassName,
                                !item.isRead && "shadow-[inset_3px_0_0_0_var(--primary)]"
                              )}
                            >
                              {person && personId ? (
                                <Link
                                  href={`/admin/employees/${personId}`}
                                  className="font-semibold text-primary underline-offset-2 hover:underline"
                                >
                                  {person.name}
                                </Link>
                              ) : (
                                <span className={person ? "font-semibold" : "text-muted-foreground"}>
                                  {person?.name ?? "—"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                              {person?.code ?? "—"}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell
                          className={cn(
                            sheetCellClassName,
                            !showPeople && !item.isRead && "shadow-[inset_3px_0_0_0_var(--primary)]"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold",
                              meta.tone
                            )}
                          >
                            <Icon className="size-3" aria-hidden />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "min-w-56 whitespace-normal")}>
                          {item.isRead ? (
                            <span className="font-medium">{heading}</span>
                          ) : (
                            <button
                              type="button"
                              className="text-left font-bold underline-offset-2 hover:underline"
                              title="Mark as read"
                            >
                              {heading}
                            </button>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(sheetCellClassName, "min-w-64 whitespace-normal text-muted-foreground")}
                        >
                          {item.body || "—"}
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
                          <time dateTime={item.createdAt}>{whenLabel(item.createdAt)}</time>
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "border-r-0")}>
                          {item.isRead ? (
                            <span className="text-xs text-muted-foreground">Read</span>
                          ) : (
                            <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                              New
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        Showing <span className="font-semibold text-foreground">{visible.length}</span> of{" "}
        <span className="font-semibold text-foreground">{items.length}</span> ·{" "}
        <span className="font-semibold text-foreground">{unread}</span> unread
      </p>
    </div>
  );
}
