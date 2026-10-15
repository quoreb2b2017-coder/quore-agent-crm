"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { hasTrustedClock, subscribeClock, trustedNowDate, trustedNowMs } from "@/lib/clock-anchor";
import { syncTrustedClock } from "@/components/layout/trusted-clock";
import { formatBreakDuration, formatDuration, formatExcess, formatTime, shiftDateIso } from "@/lib/format";
import { formatClock } from "@/lib/live-time";
import {
  BREAK_TOTAL_SECONDS,
  breakExcess,
  breakPoolLeftSeconds,
  breakSlot,
  creditedAwaySeconds,
  creditedProductiveSeconds,
  formatBreakType,
  shiftTargetSeconds,
  shiftWindowUtc,
  slotBudgetSeconds,
  creditedWorkBounds,
  type BreakSlot,
} from "@/lib/shift";
import { formatMinutesLabel, getWorkSettings } from "@/lib/work-settings";
import type { MySessionState } from "@/lib/queries/employee-status";
import { cn } from "@/lib/utils";

/** Counts up from the click with a monotonic clock, so a Google time sync cannot freeze it. */
function useElapsed(startedAt: string | null, running: boolean) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const shownRef = useRef(0);
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!running || !startedAt) {
      shownRef.current = 0;
      startedRef.current = null;
      setSeconds(null);
      return;
    }
    const startedMs = new Date(startedAt).getTime();
    const previousStarted = startedRef.current;
    const sameTimer =
      previousStarted != null &&
      Number.isFinite(startedMs) &&
      Math.abs(new Date(previousStarted).getTime() - startedMs) < 60_000;
    startedRef.current = startedAt;
    if (!sameTimer) shownRef.current = 0;
    let originPerf = performance.now();
    const trustedSeconds =
      hasTrustedClock() && Number.isFinite(startedMs)
        ? Math.max(0, Math.floor((trustedNowMs() - startedMs) / 1000))
        : 0;
    // A rewritten click time stays continuous. A new login does not keep the previous session's seconds.
    let originSeconds = Math.max(shownRef.current, trustedSeconds);
    const tick = () => {
      const next = originSeconds + Math.floor((performance.now() - originPerf) / 1000);
      if (next === shownRef.current) return;
      shownRef.current = next;
      setSeconds(next);
    };
    const onSync = () => {
      if (!hasTrustedClock() || !Number.isFinite(startedMs)) return;
      const trustedSeconds = Math.max(0, Math.floor((trustedNowMs() - startedMs) / 1000));
      const shown = originSeconds + (performance.now() - originPerf) / 1000;
      if (trustedSeconds > shown + 0.5) {
        originSeconds = trustedSeconds;
        originPerf = performance.now();
        shownRef.current = -1;
      }
      tick();
    };
    shownRef.current = -1;
    tick();
    let raf = 0;
    const frame = () => {
      tick();
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    const id = window.setInterval(tick, 1000);
    const unsub = subscribeClock(onSync);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(id);
      unsub();
    };
  }, [running, startedAt]);

  return seconds;
}

function BreakRing({ elapsed, budget }: { elapsed: number; budget: number }) {
  const used = budget > 0 ? Math.min(100, (elapsed / budget) * 100) : 0;
  return (
    <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2.5" />
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${used} 100`}
      />
    </svg>
  );
}

export function ClockWidget({
  session,
  compact = false,
  readOnly = false,
  embedded = false,
  fill = true,
}: {
  session: MySessionState;
  compact?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  /** Stretch to the parent. Off when hours sit directly under the shift bar. */
  fill?: boolean;
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
    sessionClosedWashroomSeconds = 0,
    onLeave,
    weekOff = false,
    halfDay = false,
  } = session;
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [localBreak, setLocalBreak] = useState<{ slot: BreakSlot; startedAt: string } | null>(null);
  const [breakResume, setBreakResume] = useState<{ extra: number; slot: BreakSlot | null } | null>(null);
  const [washResume, setWashResume] = useState<{ extra: number } | null>(null);
  const router = useRouter();
  const breakCaughtUp = breakResume != null && !isOnBreak;
  const washCaughtUp = washResume != null && !washroomStartedAt;
  const heldBreak = breakCaughtUp ? 0 : (breakResume?.extra ?? 0);
  const heldWash = washCaughtUp ? 0 : (washResume?.extra ?? 0);
  const breakActive = (isOnBreak || localBreak != null) && breakResume == null;
  const breakStartedAt = openBreakStartedAt ?? localBreak?.startedAt ?? null;
  const breakType = openBreakType ?? localBreak?.slot ?? null;
  const countedFrom = sessionStartedAt
    ? new Date(creditedWorkBounds(sessionStartedAt).from).toISOString()
    : null;
  const elapsed = useElapsed(countedFrom, isClockedIn);
  const nowMs = trustedNowMs();
  const elapsedCapped = sessionStartedAt ? creditedWorkBounds(sessionStartedAt, nowMs).seconds : (elapsed ?? 0);
  const shiftEndMs = sessionStartedAt
    ? shiftWindowUtc(shiftDateIso(new Date(sessionStartedAt))).end.getTime()
    : null;
  const pastLogout = shiftEndMs != null && nowMs >= shiftEndMs;
  const logoutLabel = formatMinutesLabel(getWorkSettings().logoutMinutes);
  const awayInside = (startedAt: string | null, seconds: number) => {
    if (!sessionStartedAt || !startedAt || seconds <= 0) return 0;
    return creditedAwaySeconds(
      sessionStartedAt,
      { started_at: startedAt, ended_at: null },
      new Date(startedAt).getTime() + seconds * 1000
    );
  };
  const breakElapsed = useElapsed(breakStartedAt, breakActive);
  const isInWashroom = isClockedIn && !breakActive && !!washroomStartedAt && washResume == null;
  const washroomElapsed = useElapsed(washroomStartedAt, isInWashroom);
  const isInMeeting = isClockedIn && !breakActive && !isInWashroom && !!meetingStartedAt;
  const meetingPending = isClockedIn && !breakActive && !isInWashroom && !isInMeeting && !!meetingRequestedAt;
  const meetingElapsed = useElapsed(meetingStartedAt, isInMeeting);
  const liveBreak = breakActive ? (breakElapsed ?? 0) : 0;
  const liveWashroom = isInWashroom ? (washroomElapsed ?? 0) : 0;
  // Productive time stops at logout (3:30 AM). Staying signed in after that does not add more.
  const liveSlice = isClockedIn
    ? Math.max(
        0,
        elapsedCapped -
          sessionClosedBreakSeconds -
          heldBreak -
          sessionClosedWashroomSeconds -
          heldWash -
          awayInside(breakActive ? breakStartedAt : null, liveBreak) -
          awayInside(isInWashroom ? washroomStartedAt : null, liveWashroom)
      )
    : 0;
  const dailySeconds = accruedActiveSeconds + liveSlice;
  const countedSeconds = creditedProductiveSeconds(dailySeconds, halfDay ? "HALF_DAY" : null);
  const openSlot = breakType ? breakSlot(breakType) : null;
  const usedBySlot: Record<BreakSlot, number> = {
    TEA_1: closedBreakSeconds.TEA_1 + (openSlot === "TEA_1" ? liveBreak : 0),
    TEA_2: closedBreakSeconds.TEA_2 + (openSlot === "TEA_2" ? liveBreak : 0),
    LUNCH: closedBreakSeconds.LUNCH + (openSlot === "LUNCH" ? liveBreak : 0),
  };
  if (breakResume && !breakCaughtUp && breakResume.slot) {
    usedBySlot[breakResume.slot] += breakResume.extra;
  }
  const excess = breakExcess(usedBySlot);
  const poolLeft = breakPoolLeftSeconds(usedBySlot);
  const slotRemaining = (slot: BreakSlot) => Math.max(0, slotBudgetSeconds(slot) - usedBySlot[slot]);
  const tea1Remaining = slotRemaining("TEA_1");
  const tea2Remaining = slotRemaining("TEA_2");
  const lunchRemaining = slotRemaining("LUNCH");
  const openBreakOver = openSlot ? excess[openSlot] : 0;
  const shiftTarget = shiftTargetSeconds(halfDay ? "HALF_DAY" : null);
  const shiftPct = Math.min(100, (Math.min(dailySeconds, shiftTarget) / shiftTarget) * 100);
  const poolUsedPct = Math.min(
    100,
    ((BREAK_TOTAL_SECONDS - poolLeft) / BREAK_TOTAL_SECONDS) * 100
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (localBreak && isOnBreak && openBreakStartedAt) setLocalBreak(null);
  }, [localBreak, isOnBreak, openBreakStartedAt]);

  useEffect(() => {
    if (breakCaughtUp) setBreakResume(null);
  }, [breakCaughtUp]);

  useEffect(() => {
    if (washCaughtUp) setWashResume(null);
  }, [washCaughtUp]);

  useEffect(() => {
    if (readOnly || !meetingPending) return;
    const id = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(id);
  }, [readOnly, meetingPending, router]);

  const status: EmployeeLiveStatus = breakActive
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

  function beginBreak(slot: BreakSlot) {
    const clickPerf = performance.now();
    setLocalBreak({ slot, startedAt: trustedNowDate().toISOString() });
    startTransition(async () => {
      if (!hasTrustedClock()) await syncTrustedClock();
      const startedAt = new Date(trustedNowMs() - (performance.now() - clickPerf)).toISOString();
      setLocalBreak({ slot, startedAt });
      const res = await startBreak(slot, startedAt);
      if (res.error || res.skipped) {
        setLocalBreak(null);
        if (res.error) toast.error(res.error);
        return;
      }
      window.dispatchEvent(new Event(RESET_IDLE_EVENT));
      router.refresh();
    });
  }

  function finishBreak() {
    const extra = awayInside(breakStartedAt, liveBreak);
    setBreakResume({ extra, slot: openSlot });
    setLocalBreak(null);
    startTransition(async () => {
      const res = await endBreak();
      if (res.error || res.skipped) {
        setBreakResume(null);
        if (res.error) toast.error(res.error);
        return;
      }
      window.dispatchEvent(new Event(RESET_IDLE_EVENT));
      router.refresh();
    });
  }

  function finishWashroom() {
    const extra = awayInside(washroomStartedAt, liveWashroom);
    setWashResume({ extra });
    startTransition(async () => {
      const res = await endWashroom();
      if (res.error || res.skipped) {
        setWashResume(null);
        if (res.error) toast.error(res.error);
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
        embedded && fill && "flex h-full min-h-0 flex-1 flex-col",
        !embedded && "clock-panel border",
        !embedded && (compact ? "rounded-2xl" : "rounded-3xl shadow-[0_12px_32px_oklch(0.21_0.02_260/0.06)]")
      )}
    >
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between",
          embedded && fill && "min-h-0 flex-1",
          compact ? "gap-4 p-4" : "gap-6 p-5 sm:p-6",
          breakActive && "bg-warning/10"
        )}
      >
        <div className={cn("flex items-center", compact ? "gap-3.5" : "gap-4 sm:gap-5")}>
          <div
            className={cn(
              "relative flex shrink-0 items-center justify-center shadow-inner",
              breakActive ? "size-24 rounded-full sm:size-28" : "rounded-2xl",
              !breakActive && (compact ? "size-12" : "size-16 sm:size-[4.5rem]"),
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
            {breakActive ? (
              <>
                <BreakRing elapsed={liveBreak} budget={openSlot ? slotBudgetSeconds(openSlot) : BREAK_TOTAL_SECONDS} />
                <span className="font-mono text-sm font-semibold tracking-tight tabular-nums sm:text-base">
                  {mounted ? formatClock(liveBreak) : "00:00:00"}
                </span>
              </>
            ) : isInMeeting ? (
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
                    ? ` · productive time counts from ${formatMinutesLabel(getWorkSettings().loginMinutes)}`
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
              {mounted ? formatClock(breakActive ? liveBreak : isInWashroom ? liveWashroom : countedSeconds) : "—"}
            </p>
            {breakActive ? (
              <>
                {openBreakOver > 0 ? (
                  <p className="text-xs font-semibold text-destructive">
                    {formatBreakType(breakType ?? "TEA")} running · excess +{formatExcess(openBreakOver)} over
                  </p>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatBreakType(breakType ?? "TEA")} running ·{" "}
                    {formatBreakDuration(openSlot ? slotRemaining(openSlot) : 0)} left
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Productive today {mounted ? formatClock(countedSeconds) : "—"} · paused during break
                  {pastLogout ? ` · stopped at ${logoutLabel}` : ""}
                </p>
              </>
            ) : isInWashroom ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">
                  Washroom running · {formatBreakDuration(liveWashroom)} logged · not part of break time
                </p>
                <p className="text-xs text-muted-foreground">
                  Productive today {mounted ? formatClock(countedSeconds) : "—"} · paused during washroom
                  {pastLogout ? ` · stopped at ${logoutLabel}` : ""}
                </p>
              </>
            ) : (
              <>
                {isInMeeting ? (
                  <p className="text-xs font-medium text-muted-foreground">
                    In meeting · {formatDuration(meetingElapsed ?? 0)}
                    {pastLogout ? "" : " · counts as productive time"}
                  </p>
                ) : meetingPending ? (
                  <p className="text-xs font-medium text-muted-foreground">
                    Meeting requested · waiting for admin to accept before time starts
                  </p>
                ) : null}
                {pastLogout ? (
                  <p className="text-xs font-medium text-muted-foreground">
                    Productive time stopped at {logoutLabel}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {readOnly ? (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <span className="break-chip break-chip-tea">Tea 1 {formatBreakDuration(tea1Remaining)} left</span>
            <span className="break-chip break-chip-tea">Tea 2 {formatBreakDuration(tea2Remaining)} left</span>
            <span className="break-chip break-chip-lunch">Lunch {formatBreakDuration(lunchRemaining)} left</span>
            <span className="break-chip">Total {formatBreakDuration(poolLeft)} left</span>
            {excess.total > 0 ? (
              <span className="break-chip text-destructive">Excess +{formatExcess(excess.total)}</span>
            ) : null}
          </div>
        ) : (
        <div className={cn("flex flex-col gap-2.5 sm:items-end", compact ? "min-w-0" : "min-w-[12rem]")}>
          {isClockedIn ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              Break total {formatBreakDuration(poolLeft)} left of {formatBreakDuration(BREAK_TOTAL_SECONDS)}
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
                    onClick={finishWashroom}
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
                ) : !breakActive ? (
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
                        onClick={() => beginBreak(slot)}
                      >
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Coffee className="size-4" />}
                        {formatBreakType(slot)} · {formatBreakDuration(remaining)} left
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size={compact ? "sm" : "lg"}
                      className={compact ? "h-8" : "h-10"}
                      disabled={isPending || lunchRemaining === 0}
                      onClick={() => beginBreak("LUNCH")}
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UtensilsCrossed className="size-4" />
                      )}
                      Lunch · {formatBreakDuration(lunchRemaining)} left
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size={compact ? "sm" : "lg"}
                    className={compact ? "h-8" : "h-10"}
                    disabled={isPending}
                    onClick={finishBreak}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    End {formatBreakType(breakType ?? "TEA")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size={compact ? "sm" : "lg"}
                  className={compact ? "h-8" : "h-10"}
                  disabled={isPending || breakActive || isInMeeting || isInWashroom || meetingPending}
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
          <span>{breakActive ? "Break total used" : "Shift progress"}</span>
          <span className="tabular-nums">
            {breakActive
              ? `${formatBreakDuration(BREAK_TOTAL_SECONDS - poolLeft)} / ${formatBreakDuration(BREAK_TOTAL_SECONDS)}`
              : `${Math.round(shiftPct)}% of ${halfDay ? formatDuration(shiftTarget) : "9 hrs"}`}
          </span>
        </div>
        <div className={cn("progress-track", compact ? "h-1.5" : "h-2")}>
          <div
            className={cn(
              "progress-fill",
              breakActive ? "break-progress-fill" : "shift-progress-fill"
            )}
            style={{ width: `${breakActive ? poolUsedPct : shiftPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
