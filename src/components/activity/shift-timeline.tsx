import { ActivityFeed } from "@/components/activity/activity-feed";
import { EmployeeActivityLog } from "@/components/activity/employee-activity-log";
import { initials } from "@/lib/format";
import type { ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { cn } from "@/lib/utils";

const pillClass: Record<ActivityTone, string> = {
  login: "bg-success/10 text-success",
  logout: "bg-muted text-muted-foreground",
  break: "bg-warning/15 text-warning-foreground",
  washroom: "bg-info/10 text-info",
  meeting: "bg-primary/10 text-primary",
};

export function ShiftTimeline({
  events,
  showEmployee,
}: {
  events: ShiftActivityEvent[];
  showEmployee: boolean;
}) {
  const groups = groupByEmployee(events);

  return (
    <div className={cn("grid gap-3", showEmployee && groups.length > 1 && "lg:grid-cols-2")}>
      {groups.map((group) => {
        const status = statusOf(group.events);
        return (
          <section key={group.employeeId} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              {showEmployee ? (
                <>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(group.fullName)}
                  </span>
                  <EmployeeActivityLog
                    employeeId={group.employeeId}
                    fullName={group.fullName}
                    employeeCode={group.employeeCode}
                  />
                </>
              ) : (
                <p className="min-w-0 flex-1 text-sm font-semibold">This shift</p>
              )}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  pillClass[status.tone]
                )}
              >
                {status.live ? <span className="size-1.5 rounded-full bg-current" /> : null}
                {status.text}
              </span>
            </div>

            <div className="px-4 py-3">
              <ActivityFeed events={group.events} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function groupByEmployee(events: ShiftActivityEvent[]) {
  const groups = new Map<
    string,
    { employeeId: string; fullName: string; employeeCode: string; events: ShiftActivityEvent[] }
  >();
  for (const event of events) {
    const group = groups.get(event.employeeId) ?? {
      employeeId: event.employeeId,
      fullName: event.fullName,
      employeeCode: event.employeeCode,
      events: [],
    };
    group.events.push(event);
    groups.set(event.employeeId, group);
  }
  return [...groups.values()].sort((a, b) => {
    const aLive = a.events.some((event) => event.detail === "In progress") ? 1 : 0;
    const bLive = b.events.some((event) => event.detail === "In progress") ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    const aAt = new Date(a.events[a.events.length - 1]?.at ?? 0).getTime();
    const bAt = new Date(b.events[b.events.length - 1]?.at ?? 0).getTime();
    return bAt - aAt;
  });
}

function statusOf(events: ShiftActivityEvent[]) {
  const live = [...events].reverse().find((event) => event.detail === "In progress");
  if (live) {
    return { text: liveText(live), tone: live.tone, live: true };
  }
  let open = false;
  for (const event of events) {
    if (event.tone === "login") open = true;
    if (event.tone === "logout") open = false;
  }
  if (open) return { text: "Working", tone: "login" as const, live: true };
  return { text: "Logged out", tone: "logout" as const, live: false };
}

function liveText(event: ShiftActivityEvent) {
  if (event.tone === "break") return `On ${event.label.replace(/ started$/, "")}`;
  if (event.tone === "washroom") return "In washroom";
  if (event.label === "Meeting started") return "In a meeting";
  return event.label;
}
