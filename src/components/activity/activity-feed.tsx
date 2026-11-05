"use client";

import { Bath, Coffee, LogIn, LogOut, Users } from "lucide-react";
import { TableCell } from "@/components/ui/table";
import { formatExcess, formatTime, formatTimeInZone } from "@/lib/format";
import { activityDetail } from "@/lib/activity-detail";
import { sheetCellClassName } from "@/lib/sheet-styles";
import type { ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { cn } from "@/lib/utils";

const toneIcon = {
  login: LogIn,
  logout: LogOut,
  break: Coffee,
  washroom: Bath,
  meeting: Users,
} as const;

const dotClass: Record<ActivityTone, string> = {
  login: "bg-success",
  logout: "bg-muted-foreground/45",
  break: "bg-warning",
  washroom: "bg-info",
  meeting: "bg-primary",
};

/** Only the fields the feed renders; keeps the page payload small. */
export type ActivityFeedEvent = Pick<
  ShiftActivityEvent,
  "id" | "at" | "label" | "detail" | "tone" | "excessSeconds" | "liveLimitSeconds"
>;

/** Seconds over the allowance: fixed once a break has ended, ticking while it runs. */
export function eventExcessSeconds(event: ActivityFeedEvent, now: number | null) {
  if (event.excessSeconds) return event.excessSeconds;
  if (event.liveLimitSeconds == null || event.detail !== "In progress" || now == null) return 0;
  const elapsed = Math.floor((now - new Date(event.at).getTime()) / 1000);
  return Math.max(0, elapsed - event.liveLimitSeconds);
}

/** One event as sheet cells: Time, Event and Detail. */
export function ActivityEventCells({
  event,
  now,
  zone,
}: {
  event: ActivityFeedEvent;
  now: number | null;
  zone: string;
}) {
  const Icon = toneIcon[event.tone];
  const running = event.detail === "In progress";
  const excess = eventExcessSeconds(event, now);
  return (
    <>
      <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
        <time dateTime={event.at} title={formatTime(event.at)}>
          {formatTimeInZone(event.at, zone)}
        </time>
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "font-medium")}>
        <span className="inline-flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", dotClass[event.tone])} aria-hidden />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {event.label}
        </span>
      </TableCell>
      <TableCell
        className={cn(
          sheetCellClassName,
          "border-r-0",
          excess > 0
            ? "bg-destructive/10 font-semibold text-destructive"
            : running
              ? "bg-warning/10 font-semibold text-warning"
              : "text-muted-foreground"
        )}
      >
        {activityDetail(event, now) || "—"}
        {excess > 0 ? ` · +${formatExcess(excess)} over` : ""}
      </TableCell>
    </>
  );
}

