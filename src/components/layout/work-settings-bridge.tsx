"use client";

import { useEffect } from "react";
import { syncTrustedClock } from "@/components/layout/trusted-clock";
import { setWorkSettings, type WorkSettings } from "@/lib/work-settings";

/** Puts the saved shift clock on the client before clocks and timers render. */
export function WorkSettingsBridge({
  settings,
  children,
}: {
  settings: WorkSettings;
  children: React.ReactNode;
}) {
  setWorkSettings(settings);
  useEffect(() => {
    void syncTrustedClock();
    const id = window.setInterval(() => void syncTrustedClock(), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return children;
}