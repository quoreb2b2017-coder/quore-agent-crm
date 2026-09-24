"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/attendance";

const FLAG = "worktrack-session-started";

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

  return null;
}
