import { creditedWorkBounds } from "@/lib/shift";

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
  const openBreak = input.openBreakStartedAt
    ? Math.max(0, Math.floor((now - new Date(input.openBreakStartedAt).getTime()) / 1000))
    : 0;
  const openWashroom = input.openWashroomStartedAt
    ? Math.max(0, Math.floor((now - new Date(input.openWashroomStartedAt).getTime()) / 1000))
    : 0;
  const closedAway = input.sessionClosedWashroomSeconds ?? 0;
  return (
    input.storedActiveSeconds +
    Math.max(0, elapsed - input.sessionClosedBreakSeconds - closedAway - openBreak - openWashroom)
  );
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
