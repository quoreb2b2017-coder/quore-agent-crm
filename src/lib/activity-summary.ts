import type { ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";

export type ActivityStatus = { text: string; tone: ActivityTone; live: boolean };

function liveText(event: ShiftActivityEvent) {
  if (event.tone === "break") return `On ${event.label.replace(/ started$/, "")}`;
  if (event.tone === "washroom") return "In washroom";
  if (event.label === "Meeting started") return "In a meeting";
  return event.label;
}

/** What this person is doing now, from their events in time order. */
function currentStatus(events: ShiftActivityEvent[]): ActivityStatus {
  const live = [...events].reverse().find((event) => event.detail === "In progress");
  if (live) return { text: liveText(live), tone: live.tone, live: true };
  let open = false;
  for (const event of events) {
    if (event.tone === "login") open = true;
    if (event.tone === "logout") open = false;
  }
  if (open) return { text: "Working", tone: "login", live: true };
  return { text: "Logged out", tone: "logout", live: false };
}

export function countActivity(events: ShiftActivityEvent[]) {
  return {
    logins: events.filter((event) => event.tone === "login").length,
    breaks: events.filter((event) => event.label.endsWith("started") && event.tone === "break").length,
    washrooms: events.filter((event) => event.label === "Washroom").length,
    meetings: events.filter((event) => event.label === "Meeting requested").length,
  };
}

export function summarizeActivity(events: ShiftActivityEvent[]) {
  return { ...countActivity(events), status: currentStatus(events) };
}
