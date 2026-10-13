import { Bath, Coffee, LogIn, LogOut, Users } from "lucide-react";
import { formatTime, formatTimeInZone } from "@/lib/format";
import type { ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { getWorkSettings } from "@/lib/work-settings";
import { cn } from "@/lib/utils";

const toneIcon = {
  login: LogIn,
  logout: LogOut,
  break: Coffee,
  washroom: Bath,
  meeting: Users,
} as const;

const dotClass: Record<ActivityTone, string> = {
  login: "bg-success",
  logout: "bg-muted-foreground/45",
  break: "bg-warning",
  washroom: "bg-info",
  meeting: "bg-primary",
};

export function ActivityFeed({ events }: { events: ShiftActivityEvent[] }) {
  const zone = getWorkSettings().timeZone;

  return (
    <ol>
      {events.map((event, index) => {
        const Icon = toneIcon[event.tone];
        const live = event.detail === "In progress";
        const last = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-3 last:pb-0">
            {last ? null : (
              <span className="absolute top-3.5 bottom-0 left-[4.5px] w-px bg-border" aria-hidden />
            )}
            <span
              className={cn(
                "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card",
                dotClass[event.tone]
              )}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1.5 text-sm">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{event.label}</span>
                {event.detail ? (
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      live ? "text-warning-foreground" : "text-muted-foreground"
                    )}
                  >
                    {event.detail}
                  </span>
                ) : null}
              </p>
              <time
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
                dateTime={event.at}
                title={formatTime(event.at)}
              >
                {formatTimeInZone(event.at, zone)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
