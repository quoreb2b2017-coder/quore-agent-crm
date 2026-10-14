import { Timer, Coffee, Briefcase } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { CommonDashboardData } from "@/lib/queries/employee-dashboard";
import { formatDuration } from "@/lib/format";
import {
  BREAK_TOTAL_SECONDS,
  creditedProductiveSeconds,
  productiveTargetSeconds,
  shiftTargetSeconds,
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
  const productiveSeconds = creditedProductiveSeconds(data.activeSeconds, data.attendanceStatus);
  const shiftSeconds = productiveSeconds + data.breakSeconds;
  const productiveTarget = productiveTargetSeconds(data.attendanceStatus);
  const shiftTarget = shiftTargetSeconds(data.attendanceStatus);
  return (
    <div className={packed ? "dash-stage-stats-3" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>
      <StatCard
        compact={compact}
        packed={packed}
        label="Productive"
        value={formatDuration(productiveSeconds)}
        icon={Timer}
        tone="success"
        hint={`Target ${formatDuration(productiveTarget)}${data.attendanceStatus === "HALF_DAY" ? " · half day" : ""}`}
        progress={pct(productiveSeconds, productiveTarget)}
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
        hint={`Target ${formatDuration(shiftTarget)}${data.attendanceStatus === "HALF_DAY" ? " · half day" : ""}`}
        progress={pct(shiftSeconds, shiftTarget)}
      />
    </div>
  );
}
