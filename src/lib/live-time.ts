import { creditedAwaySeconds, creditedWorkBounds } from "@/lib/shift";

/** `sessionClosed*Seconds` must already be limited to the credited window (see `creditedAwaySeconds`). */
export function dailyActiveSeconds(input: {
  storedActiveSeconds: number;
  sessionStartedAt: string | null;
  sessionClosedBreakSeconds: number;
  openBreakStartedAt: string | null;
  sessionClosedWashroomSeconds?: number;
  openWashroomStartedAt?: string | null;
  now?: number;
}) {
  if (!input.sessionStartedAt) return input.storedActiveSeconds;
  const now = input.now ?? Date.now();
  const elapsed = creditedWorkBounds(input.sessionStartedAt, now).seconds;
  const openAway = (startedAt: string | null | undefined) =>
    startedAt
      ? creditedAwaySeconds(input.sessionStartedAt as string, { started_at: startedAt, ended_at: null }, now)
      : 0;
  const closedAway = input.sessionClosedWashroomSeconds ?? 0;
  return (
    input.storedActiveSeconds +
    Math.max(
      0,
      elapsed -
        input.sessionClosedBreakSeconds -
        closedAway -
        openAway(input.openBreakStartedAt) -
        openAway(input.openWashroomStartedAt)
    )
  );
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
