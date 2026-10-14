/**
 * Wall clock anchored to Google's time.
 * Ticks with performance.now(), which does not move when the OS clock is changed.
 */

type Anchor = { utcMs: number; monoMs: number };

let anchor: Anchor | null = null;
const listeners = new Set<() => void>();

type BootWindow = Window & { __GOOGLE_UTC?: number; __GOOGLE_PERF?: number };

function readBootAnchor() {
  if (anchor || typeof window === "undefined") return;
  const boot = window as BootWindow;
  if (typeof boot.__GOOGLE_UTC === "number" && typeof boot.__GOOGLE_PERF === "number") {
    anchor = { utcMs: boot.__GOOGLE_UTC, monoMs: boot.__GOOGLE_PERF };
  }
}

export function setClockAnchor(utcMs: number, monoMs: number) {
  anchor = { utcMs, monoMs };
  listeners.forEach((listener) => listener());
}

export function hasTrustedClock() {
  readBootAnchor();
  return anchor != null;
}

export function subscribeClock(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Epoch ms from the Google anchor. Falls back to the OS clock only before the first sync. */
export function trustedNowMs(): number {
  readBootAnchor();
  if (!anchor) return Date.now();
  return Math.round(anchor.utcMs + (performance.now() - anchor.monoMs));
}

export function trustedNowDate(): Date {
  return new Date(trustedNowMs());
}
