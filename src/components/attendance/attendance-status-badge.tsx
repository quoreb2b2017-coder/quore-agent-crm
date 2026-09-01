import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const attendanceStatusTone: Record<string, string> = {
  PRESENT: "bg-success/10 text-success border-success/20",
  ABSENT: "bg-destructive/10 text-destructive border-destructive/20",
  HALF_DAY: "bg-warning/10 text-warning border-warning/20",
  ON_LEAVE: "bg-info/10 text-info border-info/20",
  HOLIDAY: "bg-muted text-muted-foreground border-transparent",
  WEEK_OFF: "bg-secondary text-secondary-foreground border-transparent",
  NO_RECORD: "bg-muted text-muted-foreground border-transparent",
};

export function AttendanceStatusBadge({ status }: { status: string }) {
  const label = status === "NO_RECORD" ? "No record" : status.replaceAll("_", " ");
  return (
    <Badge
      variant="outline"
      className={cn("font-medium capitalize", attendanceStatusTone[status] ?? "bg-muted text-muted-foreground")}
    >
      {label.toLowerCase()}
    </Badge>
  );
}
