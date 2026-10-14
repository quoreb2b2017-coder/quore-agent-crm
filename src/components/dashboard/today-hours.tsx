"use client";

import { useEffect, useState } from "react";
import { MeterRow } from "@/components/dashboard/mix-bar";
import { formatBreakDuration } from "@/lib/format";
import { dailyActiveSeconds } from "@/lib/live-time";
import type { MySessionState } from "@/lib/queries/employee-status";
import { creditedProductiveSeconds } from "@/lib/shift";

function elapsedSince(startedAt: string | null, now: number) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function TodayHours({
  session,
  idleSeconds,
  compact = false,
}: {
  session: MySessionState;
  idleSeconds: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const running = session.isClockedIn || !!session.openBreakStartedAt || !!session.washroomStartedAt;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, session.sessionStartedAt, session.openBreakStartedAt, session.washroomStartedAt]);

  const status = session.halfDay ? "HALF_DAY" : null;
  const closedBreak =
    session.closedBreakSeconds.TEA_1 + session.closedBreakSeconds.TEA_2 + session.closedBreakSeconds.LUNCH;
  const working =
    now == null
      ? creditedProductiveSeconds(session.accruedActiveSeconds, status)
      : creditedProductiveSeconds(
          dailyActiveSeconds({
            storedActiveSeconds: session.accruedActiveSeconds,
            sessionStartedAt: session.sessionStartedAt,
            sessionClosedBreakSeconds: session.sessionClosedBreakSeconds,
            openBreakStartedAt: session.isOnBreak ? session.openBreakStartedAt : null,
            sessionClosedWashroomSeconds: session.sessionClosedWashroomSeconds,
            openWashroomStartedAt: session.washroomStartedAt,
            now,
          }),
          status
        );
  const breakSeconds =
    closedBreak +
    session.closedWashroomSeconds +
    (now == null
      ? 0
      : (session.isOnBreak ? elapsedSince(session.openBreakStartedAt, now) : 0) +
        elapsedSince(session.washroomStartedAt, now));
  const hourScale = Math.max(8, working / 3600, breakSeconds / 3600, idleSeconds / 3600, 0.1);

  return (
    <>
      <MeterRow
        compact={compact}
        tone="success"
        label="Working"
        value={working / 3600}
        valueLabel={formatBreakDuration(working)}
        max={hourScale}
        barClass="bg-success"
      />
      <MeterRow
        compact={compact}
        tone="warning"
        label="Break"
        value={breakSeconds / 3600}
        valueLabel={formatBreakDuration(breakSeconds)}
        max={hourScale}
        barClass="bg-warning"
      />
      <MeterRow
        compact={compact}
        tone="info"
        label="Idle"
        value={idleSeconds / 3600}
        valueLabel={formatBreakDuration(idleSeconds)}
        max={hourScale}
        barClass="bg-info"
      />
    </>
  );
}
