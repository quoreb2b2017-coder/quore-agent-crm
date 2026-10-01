"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/attendance";
import { IDLE_LOGOUT_MS } from "@/lib/live-time";
import { syncPresence } from "@/lib/actions/presence";
import { createClient } from "@/lib/supabase/client";

const FLAG = "worktrack-session-started";
const HEARTBEAT_MS = 20_000;
const ACTIVITY_KEY = "worktrack-last-activity";
const SHARE_THROTTLE_MS = 5_000;
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
    let loggingOut = false;
    const share = (at: number) => {
      lastShared = at;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(at));
      } catch {
        /* storage blocked: this tab still tracks its own activity */
      }
    };
    const mark = () => {
      lastActivity = Date.now();
      if (lastActivity - lastShared >= SHARE_THROTTLE_MS) share(lastActivity);
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
    const tick = () => {
      if (loggingOut) return;
      const idle = Date.now() - latestActivity() >= IDLE_LOGOUT_MS;
      void syncPresence(idle).then(async (result) => {
        if (result.hold) {
          lastActivity = Date.now();
          share(lastActivity);
        }
        if (!result.expired || loggingOut) return;
        loggingOut = true;
        sessionStorage.removeItem(FLAG);
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.assign("/login");
      });
    };
    share(lastActivity);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, mark, { passive: true });
    }
    const timer = window.setInterval(tick, HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, mark);
    };
  }, []);

  return null;
}
