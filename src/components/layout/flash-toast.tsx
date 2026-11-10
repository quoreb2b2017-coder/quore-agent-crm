"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const KEY = "worktrack.flash";

type Flash = { kind: "success" | "info" | "warning" | "error"; title: string; description?: string };

/**
 * Saves a message to show on the next page. Sign-in and sign-out load a new page,
 * which would drop a toast shown before leaving.
 */
export function flashToast(flash: Flash) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flash));
  } catch {
    /* storage blocked: no message, nothing breaks */
  }
}

/** Shows a saved message once, on whichever page loads next. Mounted in the root layout. */
export function FlashToast() {
  useEffect(() => {
    let flash: Flash | null = null;
    try {
      const raw = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      flash = raw ? (JSON.parse(raw) as Flash) : null;
    } catch {
      flash = null;
    }
    if (!flash?.title) return;
    const show = { success: toast.success, info: toast.info, warning: toast.warning, error: toast.error }[flash.kind];
    // A moment after load, so it is not lost behind the page appearing.
    const timer = window.setTimeout(() => show?.(flash.title, { description: flash.description }), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
