"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PRODUCTIVE_HOURS_LABEL, PRODUCTIVE_SECONDS } from "@/lib/shift";

export type ProductivityChartPoint = {
  day: string;
  activeHours: number;
  /** Approved overtime hours (separate stack color). */
  otHours?: number;
  /** Target for that day in hours (half day is half). */
  targetHours?: number;
  status?: "met" | "short" | "in_progress" | "off" | "upcoming";
};

const DEFAULT_TARGET_HOURS = Math.round((PRODUCTIVE_SECONDS / 3600) * 100) / 100;

function barFill(status: ProductivityChartPoint["status"], hours: number, target: number) {
  if (status === "off" || status === "upcoming") return "var(--muted-foreground)";
  if (status === "in_progress") return "var(--warning)";
  if (status === "met" || (status == null && hours >= target - 0.05)) return "var(--success)";
  if (status === "short" || hours > 0) return "color-mix(in oklab, var(--destructive) 70%, transparent)";
  return "var(--muted-foreground)";
}

function formatHoursLabel(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ProductivityChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const target = row.targetHours ?? DEFAULT_TARGET_HOURS;
  const ot = row.otHours ?? 0;
  const gap = Math.round((target - row.activeHours) * 60) / 60;
  let gapLabel = "On target";
  if (row.status === "off") gapLabel = "Off";
  else if (row.status === "upcoming") gapLabel = "Upcoming";
  else if (row.status === "in_progress" && gap > 0.05) gapLabel = `${formatHoursLabel(gap)} left`;
  else if (gap > 0.05) gapLabel = `${formatHoursLabel(gap)} short`;
  else if (gap < -0.05) gapLabel = `${formatHoursLabel(-gap)} ahead`;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{row.day}</p>
      <p className="mt-1 tabular-nums text-foreground">
        Worked {formatHoursLabel(row.activeHours)}
        <span className="text-muted-foreground"> / {formatHoursLabel(target)}</span>
      </p>
      {ot > 0.01 ? (
        <p className="mt-0.5 tabular-nums" style={{ color: "var(--info, #026aa2)" }}>
          OT +{formatHoursLabel(ot)}
        </p>
      ) : null}
      <p
        className={
          gapLabel.includes("short")
            ? "mt-0.5 text-destructive"
            : gapLabel.includes("ahead") || gapLabel === "On target"
              ? "mt-0.5 text-success"
              : "mt-0.5 text-muted-foreground"
        }
      >
        {gapLabel}
      </p>
    </div>
  );
}

export function ProductivityChart({
  data,
}: {
  data: ProductivityChartPoint[];
}) {
  const targetHours =
    data.find((row) => row.targetHours != null && row.status !== "off")?.targetHours ??
    DEFAULT_TARGET_HOURS;
  const peak = Math.max(
    targetHours,
    ...data.map((row) => row.activeHours + (row.otHours ?? 0)),
    1
  );
  const hasOt = data.some((row) => (row.otHours ?? 0) > 0.01);

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} className="text-xs" />
          <YAxis
            tickLine={false}
            axisLine={false}
            className="text-xs"
            width={32}
            domain={[0, Math.ceil(peak * 2) / 2]}
          />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
          <ReferenceLine
            y={targetHours}
            stroke="var(--foreground)"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
          <Bar dataKey="activeHours" stackId="work" name="Productive" radius={[0, 0, 0, 0]}>
            {data.map((row, index) => (
              <Cell
                key={`${row.day}-${index}`}
                fill={barFill(row.status, row.activeHours, row.targetHours ?? targetHours)}
              />
            ))}
          </Bar>
          {hasOt ? (
            <Bar
              dataKey="otHours"
              stackId="work"
              name="Overtime"
              fill="var(--info, #026aa2)"
              radius={[4, 4, 0, 0]}
            />
          ) : null}
          {hasOt ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-muted-foreground">
        Dashed line = daily target ({PRODUCTIVE_HOURS_LABEL}). Blue stack = approved OT. Hover for short /
        left / met.
      </p>
    </div>
  );
}
