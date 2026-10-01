"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/attendance";
import { IDLE_LOGOUT_MS } from "@/lib/live-time";
import { expireIfIdle, touchPresence } from "@/lib/actions/presence";
import { createClient } from "@/lib/supabase/client";

const FLAG = "worktrack-session-started";
const HEARTBEAT_MS = 20_000;

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
    let hiddenAt: number | null = null;
    let loggingOut = false;
    const mark = () => {
      lastActivity = Date.now();
    };
    const logout = () => {
      if (loggingOut) return;
      loggingOut = true;
      void expireIfIdle().then(async (result) => {
        if (!result.expired) {
          loggingOut = false;
          return;
        }
        sessionStorage.removeItem(FLAG);
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.assign("/login");
      });
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= IDLE_LOGOUT_MS) logout();
      else mark();
    };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    window.addEventListener("mousemove", mark);
    document.addEventListener("visibilitychange", onVisibility);

    void touchPresence();
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity;
      const hiddenFor = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      if (idle >= IDLE_LOGOUT_MS || hiddenFor >= IDLE_LOGOUT_MS) {
        logout();
        return;
      }
      if (!document.hidden) void touchPresence();
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("mousemove", mark);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
