import { formatClock } from "@/lib/live-time";
import type { ShiftActivityEvent } from "@/lib/queries/shift-activity";

/** Open rows tick on the client. Closed login rows keep the real stay, including time after 3:30 AM. */
export function activityDetail(event: ShiftActivityEvent, now: number | null) {
  if (event.detail !== "In progress" || now == null) return event.detail;
  const seconds = Math.max(0, Math.floor((now - new Date(event.at).getTime()) / 1000));
  return `In progress · ${formatClock(seconds)}`;
}
