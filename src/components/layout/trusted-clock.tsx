"use client";

import { useEffect, useState } from "react";
import { hasTrustedClock, setClockAnchor, subscribeClock, trustedNowDate, trustedNowMs } from "@/lib/clock-anchor";

let syncing: Promise<void> | null = null;

export function syncTrustedClock() {
  if (syncing) return syncing;
  syncing = (async () => {
    const start = performance.now();
    const response = await fetch("/api/time", { cache: "no-store" });
    const end = performance.now();
    if (!response.ok) return;
    const body = (await response.json()) as { utc?: string };
    const utc = body.utc ? Date.parse(body.utc) : Number.NaN;
    if (!Number.isFinite(utc)) return;
    setClockAnchor(utc + (end - start) / 2, end);
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Google time, ticking once a second. Null until the browser has mounted. */
export function useTrustedNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(trustedNowDate());
    tick();
    const unsub = subscribeClock(tick);
    void syncTrustedClock();
    const tickId = window.setInterval(tick, 1000);
    const syncId = window.setInterval(() => void syncTrustedClock(), 60_000);
    return () => {
      unsub();
      window.clearInterval(tickId);
      window.clearInterval(syncId);
    };
  }, []);

  return now;
}

export function useTrustedNowMs(): number | null {
  const now = useTrustedNow();
  return now ? now.getTime() : null;
}

/**
 * Epoch ms for live durations. Ticks every second and does not jump backward when Google time arrives,
 * so a stopwatch on a PC with a different clock keeps counting.
 */
export function useLiveNowMs(active = true): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let perf = performance.now();
    let wall = trustedNowMs();
    const tick = () => setNow(Math.round(wall + (performance.now() - perf)));
    const onSync = () => {
      if (!hasTrustedClock()) return;
      const trusted = trustedNowMs();
      const projected = wall + (performance.now() - perf);
      if (trusted + 1000 >= projected) {
        wall = trusted;
        perf = performance.now();
      }
      tick();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const unsub = subscribeClock(onSync);
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, [active]);

  return now;
}

export { trustedNowDate, trustedNowMs };
