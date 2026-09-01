import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EmployeeLiveStatus = "ONLINE" | "BREAK" | "IDLE" | "OFFLINE";

const statusStyles: Record<EmployeeLiveStatus, string> = {
  ONLINE: "bg-success/15 text-success border-success/35",
  BREAK: "bg-warning/20 text-warning-foreground border-warning/40",
  IDLE: "bg-info/15 text-info border-info/35",
  OFFLINE: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({ status }: { status: EmployeeLiveStatus }) {
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 font-medium", statusStyles[status])}>
      <span
        className={cn(
          "relative size-1.5 rounded-full",
          status === "ONLINE" && "bg-success",
          status === "BREAK" && "bg-warning",
          status === "IDLE" && "bg-info",
          status === "OFFLINE" && "bg-muted-foreground"
        )}
      >
        {status === "ONLINE" ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-70" />
        ) : null}
      </span>
      {status === "ONLINE"
        ? "Online"
        : status === "BREAK"
          ? "On Break"
          : status === "IDLE"
            ? "Idle"
            : "Offline"}
    </Badge>
  );
}
