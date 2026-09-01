import type { RealtimeNotification } from "./types";

function socketInternalUrl() {
  return process.env.SOCKET_INTERNAL_URL || "http://127.0.0.1:3002";
}

function socketSecret() {
  return process.env.SOCKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function postSocket(path: string, body: unknown) {
  const secret = socketSecret();
  if (!secret) return;

  try {
    await fetch(`${socketInternalUrl()}${path}`, {
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
  await postSocket("/notify", { notifications });
}

export async function emitToEmployees(employeeIds: string[], event: string, payload: unknown) {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0 || !event) return;
  await postSocket("/emit", { employeeIds: ids, event, payload });
}
