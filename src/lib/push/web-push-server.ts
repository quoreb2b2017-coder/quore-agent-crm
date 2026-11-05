import "server-only";

import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { isWebPushConfigured, vapidPrivateKey, vapidPublicKey, vapidSubject } from "@/lib/env";
import { MANAGEMENT_ROLE_KEYS } from "@/lib/permissions/roles";
import type { RealtimeNotification } from "@/lib/realtime/types";

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return true;
  const publicKey = vapidPublicKey();
  const privateKey = vapidPrivateKey();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(vapidSubject(), publicKey, privateKey);
  vapidReady = true;
  return true;
}

async function inboxPathForEmployee(employeeId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id")
    .in("role_key", [...MANAGEMENT_ROLE_KEYS]);
  const roleIds = (roles ?? []).map((role) => role.id);
  if (roleIds.length === 0) return "/portal/notifications";
  const { data: link } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("employee_id", employeeId)
    .in("role_id", roleIds)
    .limit(1)
    .maybeSingle();
  return link ? "/admin/notifications" : "/portal/notifications";
}

/** High urgency so a sleeping laptop or browser is not held back; kept a day if it is offline. */
const PUSH_OPTIONS = { TTL: 24 * 60 * 60, urgency: "high" as const };

/** Sends a test alert to one saved browser and says plainly why it failed. */
export async function sendTestWebPush(subscription: { endpoint: string; p256dh: string; auth: string }) {
  if (!isWebPushConfigured() || !ensureVapid()) return { error: "Push is not configured on the server." };
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({
        id: `test-${Date.now()}`,
        title: "WorkTrack desktop alerts are on",
        body: "This is a test. Real alerts will appear like this.",
        type: "TEST",
        url: "/",
      }),
      PUSH_OPTIONS
    );
    return {};
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      await deleteSubscription(subscription.endpoint);
      return { error: "This browser's registration expired. Turn desktop alerts on again." };
    }
    if (status === 401 || status === 403) {
      return { error: "The push service refused the server key. Turn desktop alerts on again." };
    }
    return { error: `The push service could not deliver it (status ${status ?? "unknown"}).` };
  }
}

/** Remove dead browser endpoints (expired / unsubscribed). */
async function deleteSubscription(endpoint: string) {
  const supabase = createServiceClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/**
 * Fan-out Web Push for notifications already written to DB.
 * Fire-and-forget safe: failures never roll back the notification row or socket emit.
 */
export async function sendWebPushForNotifications(notifications: RealtimeNotification[]) {
  if (!isWebPushConfigured() || !ensureVapid() || notifications.length === 0) return;

  const supabase = createServiceClient();
  const byEmployee = new Map<string, RealtimeNotification[]>();
  for (const row of notifications) {
    // Session-control signal stays in-app / socket only.
    if (row.type === "ADMIN_LOGOUT") continue;
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  if (byEmployee.size === 0) return;

  const employeeIds = Array.from(byEmployee.keys());
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("employee_id, endpoint, p256dh, auth")
    .in("employee_id", employeeIds);

  if (!subs?.length) return;

  const pathCache = new Map<string, string>();
  await Promise.all(
    subs.map(async (sub) => {
      const rows = byEmployee.get(sub.employee_id);
      if (!rows?.length) return;
      let url = pathCache.get(sub.employee_id);
      if (!url) {
        url = await inboxPathForEmployee(sub.employee_id);
        pathCache.set(sub.employee_id, url);
      }
      for (const row of rows) {
        const payload = JSON.stringify({
          id: row.id,
          title: row.title,
          body: row.body ?? "",
          type: row.type,
          url,
          createdAt: row.createdAt,
        });
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            PUSH_OPTIONS
          );
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await deleteSubscription(sub.endpoint);
          } else {
            console.error(`Web push failed with status ${status ?? "unknown"}`);
          }
        }
      }
    })
  );
}
