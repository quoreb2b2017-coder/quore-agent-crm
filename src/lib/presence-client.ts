import type { PresenceResult } from "@/lib/presence-server";

export async function postPresence(idleMs: number, hadSession: boolean): Promise<PresenceResult> {
  const response = await fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idleMs, hadSession }),
    cache: "no-store",
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Presence heartbeat failed (${response.status})`);
  }
  return (await response.json()) as PresenceResult;
}

export function autoLogoutUrl(reason: string, at: number) {
  return `/login?reason=${reason}&at=${at}`;
}
