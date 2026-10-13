"use client";

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
  return children;
}