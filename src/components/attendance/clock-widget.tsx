"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Coffee, Play, Loader2, Clock as ClockIcon, UtensilsCrossed, Users, Bath } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type EmployeeLiveStatus } from "@/components/dashboard/status-badge";
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  startMeeting,
  endMeeting,
  startWashroom,
  endWashroom,
} from "@/lib/actions/attendance";
import { RESET_IDLE_EVENT } from "@/components/layout/session-presence";
import { formatDuration, formatExcess, formatTime } from "@/lib/format";
import { formatClock } from "@/lib/live-time";
import {
  BREAK_TOTAL_SECONDS,
  breakExcess,
  breakPoolLeftSeconds,
  breakSlot,
  formatBreakType,
  SHIFT_WORKING_SECONDS,
  slotBudgetSeconds,
  creditedWorkBounds,
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
    meetingRequestedAt = null,
    washroomStartedAt = null,
    closedWashroomSeconds = 0,
    sessionClosedWashroomSeconds = 0,
    onLeave,
    weekOff = false,
  } = session;
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const countedFrom = sessionStartedAt
    ? new Date(creditedWorkBounds(sessionStartedAt).from).toISOString()
    : null;
  const elapsed = useElapsed(countedFrom, isClockedIn);
  const breakElapsed = useElapsed(openBreakStartedAt, isOnBreak);
  const isInWashroom = isClockedIn && !isOnBreak && !!washroomStartedAt;
  const washroomElapsed = useElapsed(washroomStartedAt, isInWashroom);
  const isInMeeting = isClockedIn && !isOnBreak && !isInWashroom && !!meetingStartedAt;
  const meetingPending = isClockedIn && !isOnBreak && !isInWashroom && !isInMeeting && !!meetingRequestedAt;
  const meetingElapsed = useElapsed(meetingStartedAt, isInMeeting);
  const liveBreak = isOnBreak ? (breakElapsed ?? 0) : 0;
  const liveWashroom = isInWashroom ? (washroomElapsed ?? 0) : 0;
  // Only the part of an open break after 6:30 PM comes out of productive time.
  const creditedOpen = (seconds: number) => Math.min(seconds, elapsed ?? 0);
  const liveSlice = isClockedIn
    ? Math.max(
        0,
        (elapsed ?? 0) -
          sessionClosedBreakSeconds -
          sessionClosedWashroomSeconds -
          creditedOpen(liveBreak) -
          creditedOpen(liveWashroom)
      )
    : 0;
  const dailySeconds = accruedActiveSeconds + liveSlice;
  const openSlot = openBreakType ? breakSlot(openBreakType) : null;
  const usedBySlot: Record<BreakSlot, number> = {
    TEA_1: closedBreakSeconds.TEA_1 + (openSlot === "TEA_1" ? liveBreak : 0),
    TEA_2: closedBreakSeconds.TEA_2 + (openSlot === "TEA_2" ? liveBreak : 0),
    LUNCH: closedBreakSeconds.LUNCH + (openSlot === "LUNCH" ? liveBreak : 0),
  };
  const washroomUsed = closedWashroomSeconds + liveWashroom;
  const excess = breakExcess(usedBySlot, washroomUsed);
  const poolLeft = breakPoolLeftSeconds(usedBySlot, washroomUsed);
  const slotRemaining = (slot: BreakSlot) => Math.max(0, slotBudgetSeconds(slot) - usedBySlot[slot]);
  const tea1Remaining = slotRemaining("TEA_1");
  const tea2Remaining = slotRemaining("TEA_2");
  const lunchRemaining = slotRemaining("LUNCH");
  const openBreakOver = openSlot ? excess[openSlot] : 0;
  const shiftPct = Math.min(100, (dailySeconds / SHIFT_WORKING_SECONDS) * 100);
  const poolUsedPct = Math.min(
    100,
    ((BREAK_TOTAL_SECONDS - poolLeft) / BREAK_TOTAL_SECONDS) * 100
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (readOnly || !meetingPending) return;
    const id = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(id);
  }, [readOnly, meetingPending, router]);

  const status: EmployeeLiveStatus = isOnBreak
    ? "BREAK"
    : isInWashroom
      ? "WASHROOM"
      : isInMeeting
        ? "MEETING"
        : isClockedIn
          ? "ONLINE"
          : "OFFLINE";

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      window.dispatchEvent(new Event(RESET_IDLE_EVENT));
      router.refresh();
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
              status === "WASHROOM" &&
                "bg-info text-white shadow-[0_0_0_4px_oklch(0.6_0.08_220/0.22)]",
              status === "BREAK" &&
                "bg-warning text-warning-foreground shadow-[0_0_0_4px_oklch(0.75_0.14_70/0.28)]",
              status === "OFFLINE" && "bg-muted text-muted-foreground"
            )}
          >
            {isInMeeting ? (
              <Users className={compact ? "size-5" : "size-7 sm:size-8"} />
            ) : isInWashroom ? (
              <Bath className={compact ? "size-5" : "size-7 sm:size-8"} />
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
                  Logged in {mounted ? formatTime(sessionStartedAt) : "—"}
                  {mounted && countedFrom && countedFrom > sessionStartedAt
                    ? " · productive time counts from 6:30 PM"
                    : ""}
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
              {mounted ? formatClock(isOnBreak ? liveBreak : isInWashroom ? liveWashroom : dailySeconds) : "—"}
            </p>
            {isOnBreak ? (
              <>
                {openBreakOver > 0 ? (
                  <p className="text-xs font-semibold text-destructive">
                    {formatBreakType(openBreakType ?? "TEA")} running · excess +{formatExcess(openBreakOver)} over
                  </p>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatBreakType(openBreakType ?? "TEA")} running ·{" "}
                    {formatDuration(openSlot ? slotRemaining(openSlot) : 0)} left
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Productive today {mounted ? formatClock(dailySeconds) : "—"} · paused during break
                </p>
              </>
            ) : isInWashroom ? (
              <>
                <p
                  className={cn(
                    "text-xs font-medium",
                    excess.washroom > 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  Washroom running ·{" "}
                  {excess.washroom > 0
                    ? `excess +${formatExcess(excess.washroom)}`
                    : `break total ${formatDuration(poolLeft)} left`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Productive today {mounted ? formatClock(dailySeconds) : "—"} · paused during washroom
                </p>
              </>
            ) : isInMeeting ? (
              <p className="text-xs font-medium text-muted-foreground">
                In meeting · {formatDuration(meetingElapsed ?? 0)} · counts as productive time
              </p>
            ) : meetingPending ? (
              <p className="text-xs font-medium text-muted-foreground">
                Meeting requested · waiting for admin to accept before time starts
              </p>
            ) : null}
          </div>
        </div>

        {readOnly ? (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <span className="break-chip break-chip-tea">Tea 1 {formatDuration(tea1Remaining)} left</span>
            <span className="break-chip break-chip-tea">Tea 2 {formatDuration(tea2Remaining)} left</span>
            <span className="break-chip break-chip-lunch">Lunch {formatDuration(lunchRemaining)} left</span>
            <span className="break-chip">Total {formatDuration(poolLeft)} left</span>
            {excess.total > 0 ? (
              <span className="break-chip text-destructive">Excess +{formatExcess(excess.total)}</span>
            ) : null}
          </div>
        ) : (
        <div className={cn("flex flex-col gap-2.5 sm:items-end", compact ? "min-w-0" : "min-w-[12rem]")}>
          {isClockedIn ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              Break total {formatDuration(poolLeft)} left of {formatDuration(BREAK_TOTAL_SECONDS)}
              {excess.total > 0 ? (
                <span className="text-destructive"> · Excess today +{formatExcess(excess.total)}</span>
              ) : null}
            </span>
          ) : null}
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
                {isInWashroom ? (
                  <Button
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={() => run(endWashroom)}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    End washroom
                  </Button>
                ) : isInMeeting ? (
                  <Button
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={() => run(endMeeting)}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    End meeting
                  </Button>
                ) : meetingPending ? (
                  <Button
                    variant="outline"
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={() => run(endMeeting)}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Cancel request
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
                    <Button
                      variant="outline"
                      size={compact ? "sm" : "lg"}
                      className={compact ? "h-8" : "h-10"}
                      disabled={isPending}
                      onClick={() => run(startWashroom)}
                    >
                      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Bath className="size-4" />}
                      Washroom
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
                  disabled={isPending || isOnBreak || isInMeeting || isInWashroom || meetingPending}
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
          <span>{isOnBreak || isInWashroom ? "Break total used" : "Shift progress"}</span>
          <span className="tabular-nums">
            {isOnBreak || isInWashroom
              ? `${formatDuration(BREAK_TOTAL_SECONDS - poolLeft)} / ${formatDuration(BREAK_TOTAL_SECONDS)}`
              : `${Math.round(shiftPct)}% of 9 hrs`}
          </span>
        </div>
        <div className={cn("progress-track", compact ? "h-1.5" : "h-2")}>
          <div
            className={cn(
              "progress-fill",
              isOnBreak || isInWashroom ? "break-progress-fill" : "shift-progress-fill"
            )}
            style={{ width: `${isOnBreak || isInWashroom ? poolUsedPct : shiftPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
