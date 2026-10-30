import "server-only";
import { unstable_rethrow } from "next/navigation";
import { hasTrustedClock, setClockAnchor, trustedNowDate } from "@/lib/clock-anchor";

const REFRESH_MS = 5 * 60 * 1000;

type Box = { mono: number; inflight?: Promise<Date> };

const box: Box = { mono: 0 };

async function pullGoogleUtc(): Promise<number> {
  const urls = ["https://www.google.com/generate_204", "https://www.google.com"];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "follow" });
      const header = response.headers.get("date");
      const utc = header ? Date.parse(header) : Number.NaN;
      if (Number.isFinite(utc)) return utc;
      lastError = new Error("Google did not send a Date header");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google time unavailable");
}

/** Reads Google's clock and keeps ticking from it, not from the OS clock. */
export async function ensureGoogleTime(force = false): Promise<Date> {
  const fresh = hasTrustedClock() && !force && performance.now() - box.mono < REFRESH_MS;
  if (fresh) return trustedNowDate();
  if (!box.inflight) {
    box.inflight = pullGoogleUtc()
      .then((utc) => {
        const mono = performance.now();
        setClockAnchor(utc, mono);
        box.mono = mono;
        return trustedNowDate();
      })
      .finally(() => {
        box.inflight = undefined;
      });
  }
  try {
    return await box.inflight;
  } catch (error) {
    // Let Next.js internal signals (dynamic rendering bail-out etc.) through.
    unstable_rethrow(error);
    if (hasTrustedClock()) return trustedNowDate();
    // Google unreachable and no anchor yet: fall back to the server's own
    // NTP-synced clock so sign-in and attendance keep working. The browser
    // clock is still never trusted. Retry Google on the next refresh.
    console.warn("[time] Google time unavailable, using server clock:", error instanceof Error ? error.message : error);
    const mono = performance.now();
    setClockAnchor(Date.now(), mono);
    box.mono = mono - REFRESH_MS + 30_000;
    return trustedNowDate();
  }
}

export function googleDate(): Date {
  return trustedNowDate();
}
