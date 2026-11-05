"use client";

import { Fragment } from "react";
import { ActivityEventCells, type ActivityFeedEvent } from "@/components/activity/activity-feed";
import { useLiveNowMs } from "@/components/layout/trusted-clock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sheetCellClassName, sheetDateRowClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { getWorkSettings } from "@/lib/work-settings";
import { cn } from "@/lib/utils";

const dayEndClassName = "border-b-2 border-b-ink/50";

/** One date on the left for all of that day's events, closed by a total row and a heavy line. */
export function ActivityLogTable({
  days,
}: {
  days: { date: string; label: string; shiftNote: string | null; events: ActivityFeedEvent[] }[];
}) {
  const live = days.some((day) => day.events.some((event) => event.detail === "In progress"));
  const now = useLiveNowMs(live);
  const zone = getWorkSettings().timeZone;

  return (
    <div className="[&>[data-slot=table-container]]:max-h-[75svh]">
      <Table className="border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(sheetHeadClassName, "w-44")}>Date</TableHead>
            <TableHead className={sheetHeadClassName}>Time</TableHead>
            <TableHead className={sheetHeadClassName}>Event</TableHead>
            <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <Fragment key={day.date}>
              {day.events.map((event, index) => (
                <TableRow key={event.id} className={sheetRowClassName}>
                  {index === 0 ? (
                    <TableCell
                      rowSpan={day.events.length + 1}
                      className={cn(sheetCellClassName, dayEndClassName, "w-44 bg-muted align-top font-semibold")}
                    >
                      <span className="sticky top-11 block py-1.5">{day.label}</span>
                    </TableCell>
                  ) : null}
                  <ActivityEventCells event={event} now={now} zone={zone} />
                </TableRow>
              ))}
              <TableRow className={sheetDateRowClassName}>
                <TableCell
                  colSpan={3}
                  className={cn(sheetCellClassName, dayEndClassName, "border-r-0 font-bold")}
                >
                  Total · {day.events.length} {day.events.length === 1 ? "event" : "events"}
                  {day.shiftNote ? ` · ${day.shiftNote}` : ""}
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
