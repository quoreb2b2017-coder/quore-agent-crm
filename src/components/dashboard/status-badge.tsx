import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EmployeeLiveStatus = "ONLINE" | "MEETING" | "BREAK" | "IDLE" | "OFFLINE";

const statusStyles: Record<EmployeeLiveStatus, string> = {
  ONLINE: "bg-success/15 text-success border-success/35",
  MEETING: "bg-info/15 text-info border-info/35",
  BREAK: "bg-warning/20 text-warning-foreground border-warning/40",
  IDLE: "bg-info/15 text-info border-info/35",
  OFFLINE: "bg-muted text-muted-foreground border-transparent",
};

const statusLabels: Record<EmployeeLiveStatus, string> = {
  ONLINE: "Online",
  MEETING: "In Meeting",
  BREAK: "On Break",
  IDLE: "Idle",
  OFFLINE: "Offline",
};

export function StatusBadge({ status }: { status: EmployeeLiveStatus }) {
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 font-medium", statusStyles[status])}>
      <span
        className={cn(
          "relative size-1.5 rounded-full",
          status === "ONLINE" && "bg-success",
          status === "MEETING" && "bg-info",
          status === "BREAK" && "bg-warning",
          status === "IDLE" && "bg-info",
          status === "OFFLINE" && "bg-muted-foreground"
        )}
      >
        {status === "ONLINE" || status === "MEETING" ? (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-70",
              status === "ONLINE" ? "bg-success" : "bg-info"
            )}
          />
        ) : null}
      </span>
      {statusLabels[status]}
    </Badge>
  );
}
