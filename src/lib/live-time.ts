import { trustedNowMs } from "@/lib/clock-anchor";
import {
  allocateOvertime,
  creditedAwaySeconds,
  creditedWorkBounds,
  productiveTargetSeconds,
  softOvertimeMinutes,
} from "@/lib/shift";
import { getWorkSettings, type WorkSettings } from "@/lib/work-settings";

function liveSessionNet(input: {
  sessionStartedAt: string;
  sessionClosedBreakSeconds: number;
  openBreakStartedAt: string | null;
  sessionClosedWashroomSeconds?: number;
  openWashroomStartedAt?: string | null;
  now: number;
  settings: WorkSettings;
  overtimeMinutes: number;
}) {
  const elapsed = creditedWorkBounds(
    input.sessionStartedAt,
    input.now,
    input.settings,
    input.overtimeMinutes
  ).seconds;
  const openAway = (startedAt: string | null | undefined) =>
    startedAt
      ? creditedAwaySeconds(
          input.sessionStartedAt,
          { started_at: startedAt, ended_at: null },
          input.now,
          input.settings,
          input.overtimeMinutes
        )
      : 0;
  return Math.max(
    0,
    elapsed -
      input.sessionClosedBreakSeconds -
      (input.sessionClosedWashroomSeconds ?? 0) -
      openAway(input.openBreakStartedAt) -
      openAway(input.openWashroomStartedAt)
  );
}

/** `sessionClosed*Seconds` must already be limited to the credited window (see `creditedAwaySeconds`). */
export function dailyActiveSeconds(input: {
  storedActiveSeconds: number;
  sessionStartedAt: string | null;
  sessionClosedBreakSeconds: number;
  openBreakStartedAt: string | null;
  sessionClosedWashroomSeconds?: number;
  openWashroomStartedAt?: string | null;
  now?: number;
  settings?: WorkSettings;
  overtimeMinutes?: number;
  /** Attendance status for half-day target when splitting OT. */
  attendanceStatus?: string | null;
}) {
  if (!input.sessionStartedAt) return input.storedActiveSeconds;
  const now = input.now ?? trustedNowMs();
  const settings = input.settings ?? getWorkSettings();
  const approvedOt = input.overtimeMinutes ?? 0;
  const softOt = softOvertimeMinutes(approvedOt);
  const softNet = liveSessionNet({
    ...input,
    sessionStartedAt: input.sessionStartedAt,
    now,
    settings,
    overtimeMinutes: softOt,
  });
  const shiftNet = liveSessionNet({
    ...input,
    sessionStartedAt: input.sessionStartedAt,
    now,
    settings,
    overtimeMinutes: 0,
  });
  // Stored totals already exclude the open session; rebuild live productive (incl. shortfall fill).
  const allocation = allocateOvertime({
    shiftProductiveSeconds: input.storedActiveSeconds + shiftNet,
    postLogoutSeconds: Math.max(0, softNet - shiftNet),
    targetSeconds: productiveTargetSeconds(input.attendanceStatus),
    approvedOvertimeMinutes: approvedOt,
  });
  return allocation.productiveSeconds;
}

/** Live approved OT seconds for the open session (for graph / badges). */
export function dailyOvertimeSeconds(input: {
  storedActiveSeconds: number;
  storedOvertimeMinutes?: number;
  sessionStartedAt: string | null;
  sessionClosedBreakSeconds: number;
  openBreakStartedAt: string | null;
  sessionClosedWashroomSeconds?: number;
  openWashroomStartedAt?: string | null;
  now?: number;
  settings?: WorkSettings;
  overtimeMinutes?: number;
  attendanceStatus?: string | null;
}) {
  const approvedOt = input.overtimeMinutes ?? input.storedOvertimeMinutes ?? 0;
  if (!input.sessionStartedAt) return Math.max(0, approvedOt) * 60;
  const now = input.now ?? trustedNowMs();
  const settings = input.settings ?? getWorkSettings();
  const softOt = softOvertimeMinutes(approvedOt);
  const softNet = liveSessionNet({
    ...input,
    sessionStartedAt: input.sessionStartedAt,
    now,
    settings,
    overtimeMinutes: softOt,
  });
  const shiftNet = liveSessionNet({
    ...input,
    sessionStartedAt: input.sessionStartedAt,
    now,
    settings,
    overtimeMinutes: 0,
  });
  const allocation = allocateOvertime({
    shiftProductiveSeconds: input.storedActiveSeconds + shiftNet,
    postLogoutSeconds: Math.max(0, softNet - shiftNet),
    targetSeconds: productiveTargetSeconds(input.attendanceStatus),
    approvedOvertimeMinutes: approvedOt,
  });
  return allocation.overtimeSeconds;
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
