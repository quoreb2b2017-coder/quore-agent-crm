import { formatDuration, formatIsoDate } from "@/lib/format";
import type { ProductivityDay } from "@/lib/queries/productivity-report";

export type ShiftDayTone = "complete" | "short" | "progress" | "off";

export type ShiftDayLine = {
  date: string;
  dateLabel: string;
  result: string;
  worked: string;
  target: string;
  short: string;
  tone: ShiftDayTone;
};

export function shiftDayLines(days: ProductivityDay[]): ShiftDayLine[] {
  return days
    .filter((day) => day.status !== "upcoming")
    .map((day) => {
      const left = Math.max(0, day.targetSeconds - day.productiveSeconds);
      const half = day.attendanceStatus === "HALF_DAY" ? " (half day)" : "";
      if (day.status === "off") {
        const result = day.offStatus === "HOLIDAY" ? "Holiday" : day.offStatus === "WEEK_OFF" ? "Week off" : "Leave";
        return {
          date: day.date,
          dateLabel: formatIsoDate(day.date),
          result,
          worked: "-",
          target: "-",
          short: "Off",
          tone: "off",
        };
      }
      if (day.status === "met") {
        return {
          date: day.date,
          dateLabel: formatIsoDate(day.date),
          result: `Complete${half}`,
          worked: formatDuration(day.productiveSeconds),
          target: formatDuration(day.targetSeconds),
          short: "On target",
          tone: "complete",
        };
      }
      if (day.status === "in_progress") {
        return {
          date: day.date,
          dateLabel: formatIsoDate(day.date),
          result: `In progress${half}`,
          worked: formatDuration(day.productiveSeconds),
          target: formatDuration(day.targetSeconds),
          short: left > 0 ? `${formatDuration(left)} left` : "On target",
          tone: "progress",
        };
      }
      return {
        date: day.date,
        dateLabel: formatIsoDate(day.date),
        result: `Short${half}`,
        worked: formatDuration(day.productiveSeconds),
        target: formatDuration(day.targetSeconds),
        short: `${formatDuration(left)} short`,
        tone: "short",
      };
    });
}

export function shiftShortSummary(days: ProductivityDay[]) {
  const finished = days.filter((day) => day.status === "met" || day.status === "short");
  const complete = finished.filter((day) => day.status === "met").length;
  const shortDays = finished.filter((day) => day.status === "short");
  const shortSeconds = shortDays.reduce(
    (sum, day) => sum + Math.max(0, day.targetSeconds - day.productiveSeconds),
    0
  );
  const today = days.find((day) => day.status === "in_progress");
  const todayLeft = today ? Math.max(0, today.targetSeconds - today.productiveSeconds) : 0;
  const parts = [`${complete} complete`, `${shortDays.length} short`, `${formatDuration(shortSeconds)} short`];
  if (today) parts.push(`today ${formatDuration(todayLeft)} left`);
  return {
    complete,
    shortDays: shortDays.length,
    shortSeconds,
    label: parts.join(" | "),
  };
}
