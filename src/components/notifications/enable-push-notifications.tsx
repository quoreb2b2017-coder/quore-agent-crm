"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/actions/push-subscriptions";
import {
  currentPushSubscription,
  ensurePushServiceWorker,
  pushSupported,
  subscribeBrowserPush,
} from "@/lib/push/browser";

const DISMISS_KEY = "worktrack.push.banner.dismissed";

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
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (Notification.permission === "denied") return;

      await ensurePushServiceWorker().catch(() => null);
      const existing = await currentPushSubscription();
      if (cancelled) return;
      if (existing && Notification.permission === "granted") {
        // Refresh server copy in case this device was wiped from DB.
        const { publicKey } = await getPushPublicKey();
        if (publicKey) {
          const json = existing.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            void savePushSubscription({
              endpoint: json.endpoint,
              keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
              userAgent: navigator.userAgent.slice(0, 500),
            });
          }
        }
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
                const { publicKey } = await getPushPublicKey();
                if (!publicKey) {
                  setError("Push is not configured on the server.");
                  return;
                }
                const sub = await subscribeBrowserPush(publicKey);
                const json = sub.toJSON();
                if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
                  setError("Browser returned an incomplete subscription.");
                  return;
                }
                const result = await savePushSubscription({
                  endpoint: json.endpoint,
                  keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
                  userAgent: navigator.userAgent.slice(0, 500),
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setVisible(false);
              } catch (err) {
                const message = err instanceof Error ? err.message : "Could not enable notifications";
                if (/denied/i.test(message)) {
                  localStorage.setItem(DISMISS_KEY, "1");
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
            localStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
            void (async () => {
              const sub = await currentPushSubscription();
              if (sub) {
                const endpoint = sub.endpoint;
                await sub.unsubscribe().catch(() => null);
                await removePushSubscription(endpoint);
              }
            })();
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
