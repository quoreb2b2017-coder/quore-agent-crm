"use client";

import type { ReactNode } from "react";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LeaveReasonTip({
  subject,
  reason,
  children,
}: {
  subject?: string;
  reason?: string;
  children: ReactNode;
}) {
  const comment = reason?.trim() ?? "";
  const heading = subject?.trim() && subject.trim() !== comment ? subject.trim() : "";
  if (!comment && !heading) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal">
        {heading ? <p className="font-medium">{heading}</p> : null}
        {comment ? <p className="whitespace-pre-wrap">{comment}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function AttendanceLeaveMark({
  status,
  subject,
  reason,
}: {
  status: string;
  subject?: string | null;
  reason?: string | null;
}) {
  const label = subject?.trim() ?? "";
  const comment = reason?.trim() ?? "";
  const mark = (
    <span className="inline-flex max-w-[16rem] flex-col gap-0.5">
      <AttendanceStatusBadge status={status} />
      {status === "ON_LEAVE" && label ? (
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
  if (status !== "ON_LEAVE" || !comment) return mark;
  return (
    <LeaveReasonTip subject={label} reason={comment}>
      {mark}
    </LeaveReasonTip>
  );
}
