"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Loader2, MonitorUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removePushSubscription, sendTestPushNotification } from "@/lib/actions/push-subscriptions";
import { currentPushSubscription, ensurePushServiceWorker, pushSupported } from "@/lib/push/browser";
import { enableDesktopNotifications } from "@/lib/push/enable";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

/** Shows whether this browser gets alerts outside the app, and lets anyone turn them on and test them. */
export function DesktopAlertsControl() {
  const [state, setState] = useState<State>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!pushSupported()) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      await ensurePushServiceWorker().catch(() => null);
      const sub = await currentPushSubscription();
      if (!sub || Notification.permission !== "granted") {
        if (!cancelled) setState("off");
        return;
      }
      // Saves it for whoever is signed in now, and replaces one made with an old server key.
      const saved = await enableDesktopNotifications().catch(() => null);
      if (cancelled) return;
      setEndpoint(saved);
      setState(saved ? "on" : "off");
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  function turnOn() {
    startTransition(async () => {
      try {
        const saved = await enableDesktopNotifications();
        setEndpoint(saved);
        setState("on");
        const result = await sendTestPushNotification(saved);
        if (result.error) toast.error(result.error);
        else toast.success("Desktop alerts are on. A test alert was sent.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not turn on desktop alerts";
        if (/denied/i.test(message)) setState("blocked");
        else toast.error(message);
      }
    });
  }

  function sendTest() {
    if (!endpoint) return;
    startTransition(async () => {
      const result = await sendTestPushNotification(endpoint);
      if (result.error) toast.error(result.error);
      else toast.success("Test alert sent. It should appear outside the browser in a few seconds.");
    });
  }

  function turnOff() {
    startTransition(async () => {
      const sub = await currentPushSubscription();
      if (sub) {
        await sub.unsubscribe().catch(() => null);
        await removePushSubscription(sub.endpoint);
      }
      setEndpoint(null);
      setState("off");
    });
  }

  if (state === "checking") return null;

  const content = {
    unsupported: {
      Icon: BellOff,
      title: "This browser cannot show desktop alerts",
      hint: "Use Chrome or Edge to get alerts outside the app.",
    },
    blocked: {
      Icon: BellOff,
      title: "Desktop alerts are blocked in this browser",
      hint: "Click the icon left of the address bar, set Notifications to Allow, then reload this page.",
    },
    off: {
      Icon: BellOff,
      title: "Desktop alerts are off in this browser",
      hint: "Turn them on to get alerts when this tab is in the background or closed.",
    },
    on: {
      Icon: BellRing,
      title: "Desktop alerts are on in this browser",
      hint: "No alert on the test? In Windows, check Settings → System → Notifications: allow your browser and turn off Do not disturb.",
    },
  }[state];

  return (
    <section className="flex flex-wrap items-center gap-3 border bg-card px-3 py-2" aria-label="Desktop alerts">
      <content.Icon
        className={state === "on" ? "size-4 shrink-0 text-success" : "size-4 shrink-0 text-warning"}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{content.title}</p>
        <p className="text-xs text-muted-foreground">{content.hint}</p>
      </div>
      {isPending ? <Loader2 className="size-4 animate-spin text-primary" aria-label="Loading" /> : null}
      {state === "off" ? (
        <Button size="sm" className="rounded-sm" disabled={isPending} onClick={turnOn}>
          <BellRing className="size-3.5" />
          Turn on
        </Button>
      ) : null}
      {state === "on" ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-sm" disabled={isPending} onClick={sendTest}>
            <MonitorUp className="size-3.5" />
            Send test alert
          </Button>
          <Button size="sm" variant="ghost" className="rounded-sm" disabled={isPending} onClick={turnOff}>
            Turn off
          </Button>
        </div>
      ) : null}
    </section>
  );
}
