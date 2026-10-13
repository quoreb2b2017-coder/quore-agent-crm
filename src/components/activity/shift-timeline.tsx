import { Bath, Coffee, LogIn, LogOut, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import type { ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { cn } from "@/lib/utils";

const toneIcon = {
  login: LogIn,
  logout: LogOut,
  break: Coffee,
  washroom: Bath,
  meeting: Users,
} as const;

const toneClass: Record<ActivityTone, string> = {
  login: "border-success/20 bg-success/10 text-success",
  logout: "border-muted-foreground/20 bg-muted text-muted-foreground",
  break: "border-warning/20 bg-warning/10 text-warning-foreground",
  washroom: "border-info/25 bg-info/10 text-info",
  meeting: "border-primary/20 bg-primary/10 text-primary",
};

export function ShiftTimeline({
  events,
  showEmployee,
}: {
  events: ShiftActivityEvent[];
  showEmployee: boolean;
}) {
  return (
    <ol className="flex flex-col">
      {events.map((event) => {
        const Icon = toneIcon[event.tone];
        return (
          <li
            key={event.id}
            className="flex items-start gap-3 border-b px-5 py-3 last:border-b-0"
          >
            <span className="w-36 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums sm:w-44">
              {formatTime(event.at)}
            </span>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              {showEmployee ? (
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{event.fullName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{event.employeeCode}</span>
                </div>
              ) : null}
              <div className={cn("flex flex-wrap items-center gap-2", showEmployee && "mt-1")}>
                <span className="text-sm">{event.label}</span>
                {event.detail ? (
                  <Badge variant="outline" className={cn("font-medium", toneClass[event.tone])}>
                    {event.detail}
                  </Badge>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
