"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Coffee, Play, Loader2, Clock as ClockIcon, UtensilsCrossed, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type EmployeeLiveStatus } from "@/components/dashboard/status-badge";
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  endWorkSession,
  startMeeting,
  endMeeting,
} from "@/lib/actions/attendance";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, formatTime } from "@/lib/format";
import { formatClock } from "@/lib/live-time";
import {
  breakSlot,
  formatBreakType,
  openBreakLimitSeconds,
  SHIFT_WORKING_SECONDS,
  slotBudgetSeconds,
  type BreakSlot,
} from "@/lib/shift";
import type { MySessionState } from "@/lib/queries/employee-status";
import { cn } from "@/lib/utils";

function useElapsed(startedAt: string | null, running: boolean) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!running || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (now == null || !startedAt || !running) return null;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function ClockWidget({
  session,
  compact = false,
  readOnly = false,
  embedded = false,
}: {
  session: MySessionState;
  compact?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const {
    isClockedIn,
    isOnBreak,
    sessionStartedAt,
    accruedActiveSeconds = 0,
    sessionClosedBreakSeconds = 0,
    closedBreakSeconds = { TEA_1: 0, TEA_2: 0, LUNCH: 0 },
    openBreakType,
    openBreakStartedAt,
    meetingStartedAt = null,
    onLeave,
    weekOff = false,
  } = session;
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const elapsed = useElapsed(sessionStartedAt, isClockedIn);
  const breakElapsed = useElapsed(openBreakStartedAt, isOnBreak);
  const isInMeeting = isClockedIn && !isOnBreak && !!meetingStartedAt;
  const meetingElapsed = useElapsed(meetingStartedAt, isInMeeting);
  const liveSlice = isClockedIn
    ? Math.max(0, (elapsed ?? 0) - sessionClosedBreakSeconds - (isOnBreak ? (breakElapsed ?? 0) : 0))
    : 0;
  const dailySeconds = accruedActiveSeconds + liveSlice;
  const openSlot = openBreakType ? breakSlot(openBreakType) : null;
  const slotRemaining = (slot: BreakSlot) =>
    Math.max(
      0,
      slotBudgetSeconds(slot) -
        closedBreakSeconds[slot] -
        (openSlot === slot ? (breakElapsed ?? 0) : 0)
    );
  const tea1Remaining = slotRemaining("TEA_1");
  const tea2Remaining = slotRemaining("TEA_2");
  const lunchRemaining = slotRemaining("LUNCH");
  const openSlotClosedSeconds = openSlot ? closedBreakSeconds[openSlot] : 0;
  const breakBudget = openBreakType
    ? openBreakLimitSeconds(openBreakType, openSlotClosedSeconds)
    : 0;
  const breakRemaining = Math.max(0, breakBudget - (breakElapsed ?? 0));
  const shiftPct = Math.min(100, (dailySeconds / SHIFT_WORKING_SECONDS) * 100);
  const breakPct =
    isOnBreak && breakBudget > 0
      ? Math.min(100, ((breakBudget - breakRemaining) / breakBudget) * 100)
      : 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (readOnly || !isOnBreak || !openBreakStartedAt || !openBreakType) return;
    const remainingAtStart = openBreakLimitSeconds(openBreakType, openSlotClosedSeconds);
    const delay = Math.max(
      0,
      new Date(openBreakStartedAt).getTime() + remainingAtStart * 1000 - Date.now()
    );
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const res = await endWorkSession();
        if (res.error) {
          toast.error(res.error);
          return;
        }
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.assign("/login");
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [readOnly, isOnBreak, openBreakStartedAt, openBreakType, openSlotClosedSeconds, router]);

  const status: EmployeeLiveStatus = isOnBreak
    ? "BREAK"
    : isInMeeting
      ? "MEETING"
      : isClockedIn
        ? "ONLINE"
        : "OFFLINE";

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden",
        embedded && "flex h-full min-h-0 flex-1 flex-col",
        !embedded && "clock-panel border",
        !embedded && (compact ? "rounded-2xl" : "rounded-3xl shadow-[0_12px_32px_oklch(0.21_0.02_260/0.06)]")
      )}
    >
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between",
          embedded && "min-h-0 flex-1",
          compact ? "gap-4 p-4" : "gap-6 p-5 sm:p-6",
          isOnBreak && "bg-warning/10"
        )}
      >
        <div className={cn("flex items-center", compact ? "gap-3.5" : "gap-4 sm:gap-5")}>
          <div
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-2xl shadow-inner",
              compact ? "size-12" : "size-16 sm:size-[4.5rem]",
              status === "ONLINE" &&
                "bg-success text-white shadow-[0_0_0_4px_oklch(0.55_0.14_155/0.22)]",
              status === "MEETING" &&
                "bg-info text-white shadow-[0_0_0_4px_oklch(0.6_0.12_240/0.22)]",
              status === "BREAK" &&
                "bg-warning text-warning-foreground shadow-[0_0_0_4px_oklch(0.75_0.14_70/0.28)]",
              status === "OFFLINE" && "bg-muted text-muted-foreground"
            )}
          >
            {isInMeeting ? (
              <Users className={compact ? "size-5" : "size-7 sm:size-8"} />
            ) : (
              <ClockIcon className={compact ? "size-5" : "size-7 sm:size-8"} />
            )}
            {status === "ONLINE" ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
            ) : null}
          </div>
          <div className={cn("flex min-w-0 flex-col", compact ? "gap-1" : "gap-1.5")}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {sessionStartedAt ? (
                <span className="text-xs text-muted-foreground">
                  Since {mounted ? formatTime(sessionStartedAt) : "—"}
                </span>
              ) : onLeave ? (
                <span className="text-xs text-muted-foreground">On approved leave this shift</span>
              ) : weekOff ? (
                <span className="text-xs text-muted-foreground">Saturday–Sunday week off</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {readOnly ? "Not clocked in this shift" : "Attendance marks as soon as you sign in"}
                </span>
              )}
            </div>
            <p
              className={cn(
                "font-mono font-semibold tracking-tight tabular-nums",
                compact ? "text-2xl" : "text-3xl sm:text-4xl",
                (status === "ONLINE" || status === "MEETING") && "clock-timer",
                status === "BREAK" && "text-warning-foreground",
                status === "OFFLINE" && "text-muted-foreground"
              )}
            >
              {mounted ? formatClock(dailySeconds) : "—"}
            </p>
            {isOnBreak ? (
              <p className="text-xs font-medium text-muted-foreground">
                {formatBreakType(openBreakType ?? "TEA")} remaining · {formatDuration(breakRemaining)} left
              </p>
            ) : isInMeeting ? (
              <p className="text-xs font-medium text-muted-foreground">
                In meeting · {formatDuration(meetingElapsed ?? 0)} · counts as productive time
              </p>
            ) : null}
          </div>
        </div>

        {readOnly ? (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <span className="break-chip break-chip-tea">Tea 1 {formatDuration(tea1Remaining)} left</span>
            <span className="break-chip break-chip-tea">Tea 2 {formatDuration(tea2Remaining)} left</span>
            <span className="break-chip break-chip-lunch">Lunch {formatDuration(lunchRemaining)} left</span>
          </div>
        ) : (
        <div className={cn("flex flex-col gap-2.5 sm:items-end", compact ? "min-w-0" : "min-w-[12rem]")}>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {!isClockedIn ? (
              <Button
                size={compact ? "sm" : "lg"}
                className={compact ? "h-8 px-3" : "h-10 px-4"}
                disabled={isPending || onLeave || weekOff}
                onClick={() => run(clockIn)}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {onLeave ? "On leave" : weekOff ? "Week off" : "Clock in"}
              </Button>
            ) : (
              <>
                {isInMeeting ? (
                  <Button
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={() => run(endMeeting)}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    End meeting
                  </Button>
                ) : !isOnBreak ? (
                  <>
                    <Button
                      variant="outline"
                      size={compact ? "sm" : "lg"}
                      className={compact ? "h-8" : "h-10"}
                      disabled={isPending}
                      onClick={() => run(startMeeting)}
                    >
                      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
                      Meeting
                    </Button>
                    {(
                      [
                        ["TEA_1", tea1Remaining],
                        ["TEA_2", tea2Remaining],
                      ] as const
                    ).map(([slot, remaining]) => (
                      <Button
                        key={slot}
                        variant="outline"
                        size={compact ? "sm" : "lg"}
                        className={compact ? "h-8" : "h-10"}
                        disabled={isPending || remaining === 0}
                        onClick={() => run(() => startBreak(slot))}
                      >
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Coffee className="size-4" />}
                        {formatBreakType(slot)} · {formatDuration(remaining)} left
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size={compact ? "sm" : "lg"}
                      className={compact ? "h-8" : "h-10"}
                      disabled={isPending || lunchRemaining === 0}
                      onClick={() => run(() => startBreak("LUNCH"))}
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UtensilsCrossed className="size-4" />
                      )}
                      Lunch · {formatDuration(lunchRemaining)} left
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={() => run(endBreak)}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    End {formatBreakType(openBreakType ?? "TEA")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size={compact ? "sm" : "lg"}
                  className={compact ? "h-8" : "h-10"}
                  disabled={isPending || isOnBreak || isInMeeting}
                  onClick={() => run(clockOut)}
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                  Clock out
                </Button>
              </>
            )}
          </div>
        </div>
        )}
      </div>

      <div className={cn("shrink-0 border-t shift-foot", compact ? "px-4 py-2.5" : "px-5 py-3 sm:px-6")}>
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>{isOnBreak ? "Break used" : "Shift progress"}</span>
          <span className="tabular-nums">
            {isOnBreak ? `${Math.round(breakPct)}%` : `${Math.round(shiftPct)}% of 9 hrs`}
          </span>
        </div>
        <div className={cn("progress-track", compact ? "h-1.5" : "h-2")}>
          <div
            className={cn("progress-fill", isOnBreak ? "break-progress-fill" : "shift-progress-fill")}
            style={{ width: `${isOnBreak ? breakPct : shiftPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
