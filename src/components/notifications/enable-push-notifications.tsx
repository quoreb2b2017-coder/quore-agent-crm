"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentPushSubscription, ensurePushServiceWorker, pushSupported } from "@/lib/push/browser";
import { enableDesktopNotifications } from "@/lib/push/enable";

const DISMISS_KEY = "worktrack.push.banner.dismissed";
/** Dismissing only delays the reminder, so nobody stays without alerts by accident. */
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Soft opt-in for desktop notifications. Does not call requestPermission until
 * the user clicks Enable (appropriate timing). Existing Socket.IO toasts stay as-is.
 */
export function EnablePushNotifications() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!pushSupported()) return;
      if (typeof window === "undefined") return;
      if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_FOR_MS) return;
      if (Notification.permission === "denied") return;

      await ensurePushServiceWorker().catch(() => null);
      const existing = await currentPushSubscription();
      if (cancelled) return;
      if (existing && Notification.permission === "granted") {
        // Refresh the server copy: the device may be wiped from DB, or another person signed in here.
        void enableDesktopNotifications().catch(() => null);
        return;
      }
      setVisible(true);
    }
    const timer = window.setTimeout(() => {
      void check();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!pushSupported()) return;
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "worktrack:notification") {
        window.dispatchEvent(new Event("worktrack:notification"));
        if (event.data.pushType === "CHAT_MESSAGE") window.dispatchEvent(new Event("worktrack:chat-unread"));
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2 text-[13px] md:px-8">
      <BellRing className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        Enable desktop notifications so alerts still appear when this tab is in the background or closed.
      </p>
      {error ? <span className="text-destructive">{error}</span> : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await enableDesktopNotifications();
                setVisible(false);
              } catch (err) {
                const message = err instanceof Error ? err.message : "Could not enable notifications";
                if (/denied/i.test(message)) {
                  setVisible(false);
                  return;
                }
                setError(message);
              }
            });
          }}
        >
          {pending ? "Enabling…" : "Enable"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="px-2"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setVisible(false);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
