import { after } from "next/server";
import { runPresenceHeartbeat, sweepIdleSessions } from "@/lib/presence-server";

/**
 * Presence heartbeat. A route handler (not a Server Action) so it never queues behind the
 * user's clicks or triggers a page refresh.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { idleMs?: unknown; hadSession?: unknown };
  const result = await runPresenceHeartbeat({
    idleMs: Number(body.idleMs),
    hadSession: body.hadSession === true,
  });
  after(() => sweepIdleSessions());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
