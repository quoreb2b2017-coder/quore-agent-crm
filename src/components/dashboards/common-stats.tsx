import { Timer, Coffee, Briefcase } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { CommonDashboardData } from "@/lib/queries/employee-dashboard";
import { formatDuration } from "@/lib/format";
import {
  BREAK_TOTAL_SECONDS,
  PRODUCTIVE_SECONDS,
  SHIFT_WORKING_SECONDS,
} from "@/lib/shift";

function pct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.round((value / max) * 100);
}

export function CommonStats({
  data,
  compact = false,
  packed = false,
}: {
  data: CommonDashboardData;
  compact?: boolean;
  packed?: boolean;
}) {
  const shiftSeconds = data.activeSeconds + data.breakSeconds;
  return (
    <div className={packed ? "dash-stage-stats-3" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>
      <StatCard
        compact={compact}
        packed={packed}
        label="Productive"
        value={formatDuration(data.activeSeconds)}
        icon={Timer}
        tone="success"
        hint={`Target ${formatDuration(PRODUCTIVE_SECONDS)}`}
        progress={pct(data.activeSeconds, PRODUCTIVE_SECONDS)}
      />
      <StatCard
        compact={compact}
        packed={packed}
        label="Breaks"
        value={formatDuration(data.breakSeconds)}
        icon={Coffee}
        tone="warning"
        hint="Used this shift"
        progress={pct(data.breakSeconds, BREAK_TOTAL_SECONDS)}
      />
      <StatCard
        compact={compact}
        packed={packed}
        label="Shift hours"
        value={formatDuration(shiftSeconds)}
        icon={Briefcase}
        tone="info"
        hint={`Target ${formatDuration(SHIFT_WORKING_SECONDS)}`}
        progress={pct(shiftSeconds, SHIFT_WORKING_SECONDS)}
      />
    </div>
  );
}
