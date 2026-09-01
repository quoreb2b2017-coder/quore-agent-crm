"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/attendance";

const FLAG = "worktrack-session-started";

export function SessionPresence({ enableClockIn = true }: { enableClockIn?: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!enableClockIn || ran.current) return;
    ran.current = true;

    if (typeof window !== "undefined" && sessionStorage.getItem(FLAG) === "done") {
      return;
    }

    void clockIn().then((result) => {
      if (result.error) {
        sessionStorage.removeItem(FLAG);
        toast.error(result.error);
        return;
      }
      if (result.skipped) return;
      sessionStorage.setItem(FLAG, "done");
      if (result.activated) {
        window.setTimeout(() => router.refresh(), 2000);
      }
    });
  }, [enableClockIn, router]);

  return null;
}
