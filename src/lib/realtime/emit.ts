import type { RealtimeNotification } from "./types";
import { serverSocketUrl, socketAuthSecret } from "@/lib/env";
import { sendWebPushForNotifications } from "@/lib/push/web-push-server";

async function postSocket(path: string, body: unknown) {
  const base = serverSocketUrl();
  const secret = socketAuthSecret();
  if (!base || !secret) return;

  try {
    await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    // Socket server may be down; the row is already stored.
  }
}

export async function emitNotifications(notifications: RealtimeNotification[]) {
  if (notifications.length === 0) return;
  // Existing in-app realtime path (unchanged).
  await postSocket("/notify", { notifications });
  // Parallel offline channel — never blocks or rolls back the DB/socket path.
  void sendWebPushForNotifications(notifications).catch(() => {});
}

export async function emitToEmployees(employeeIds: string[], event: string, payload: unknown) {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0 || !event) return;
  await postSocket("/emit", { employeeIds: ids, event, payload });
}
