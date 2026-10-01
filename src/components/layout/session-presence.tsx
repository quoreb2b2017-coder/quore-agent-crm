"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/attendance";
import { autoLogoutUrl, postPresence } from "@/lib/presence-client";
import { createClient } from "@/lib/supabase/client";

export const SESSION_STARTED_FLAG = "worktrack-session-started";
const FLAG = SESSION_STARTED_FLAG;
const HEARTBEAT_MS = 20_000;
const ACTIVITY_KEY = "worktrack-last-activity";
const SHARE_THROTTLE_MS = 5_000;
/** Dispatch on window after a break or meeting ends so the idle countdown starts fresh. */
export const RESET_IDLE_EVENT = "worktrack:reset-idle";
const ACTIVITY_EVENTS = [
  "keydown",
  "mousemove",
  "mousedown",
  "wheel",
  "scroll",
  "touchstart",
] as const;

/** Marks attendance once per browser tab. Does not refresh the whole page. */
export function SessionPresence({ enableClockIn = true }: { enableClockIn?: boolean }) {
  const ran = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!enableClockIn || ran.current) return;
    ran.current = true;

    if (typeof window !== "undefined" && sessionStorage.getItem(FLAG) === "done") {
      return;
    }

    const timer = window.setTimeout(() => {
      void clockIn().then((result) => {
        if (result.error) {
          sessionStorage.removeItem(FLAG);
          toast.error(result.error);
          return;
        }
        if (result.skipped) return;
        sessionStorage.setItem(FLAG, "done");
      });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [enableClockIn]);

  useEffect(() => {
    let lastActivity = Date.now();
    let lastShared = 0;
    // Longest stretch without activity since the last heartbeat that reached the server.
    let gapSinceSync = 0;
    let loggingOut = false;
    let hadSession = false;
    let inFlight = false;
    const share = (at: number) => {
      lastShared = at;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(at));
      } catch {
        /* storage blocked: this tab still tracks its own activity */
      }
    };
    // Activity in any open CRM tab keeps every tab signed in.
    const latestActivity = () => {
      let shared = 0;
      try {
        shared = Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
      } catch {
        shared = 0;
      }
      return Math.max(lastActivity, shared);
    };
    const mark = () => {
      const now = Date.now();
      gapSinceSync = Math.max(gapSinceSync, now - latestActivity());
      lastActivity = now;
      if (now - lastShared >= SHARE_THROTTLE_MS) share(now);
    };
    const resetIdle = () => {
      lastActivity = Date.now();
      gapSinceSync = 0;
      share(lastActivity);
    };
    const signOut = async (reason: string, at: number) => {
      loggingOut = true;
      sessionStorage.removeItem(FLAG);
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.assign(autoLogoutUrl(reason, at));
    };
    const tick = async () => {
      if (loggingOut || inFlight) return;
      inFlight = true;
      const idleMs = Math.max(gapSinceSync, Date.now() - latestActivity());
      gapSinceSync = 0;
      try {
        const result = await postPresence(idleMs, hadSession);
        if (result.active) hadSession = true;
        if (result.hold) resetIdle();
        if (result.resumed) router.refresh();
        if (result.expired && !loggingOut) {
          await signOut(result.reason ?? "timeout", result.at ?? Date.now());
        }
      } catch {
        // Not delivered: keep the idle stretch so the next heartbeat still reports it.
        gapSinceSync = Math.max(gapSinceSync, idleMs);
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    share(lastActivity);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, mark, { passive: true });
    }
    window.addEventListener(RESET_IDLE_EVENT, resetIdle);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void tick(), HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, mark);
      window.removeEventListener(RESET_IDLE_EVENT, resetIdle);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
