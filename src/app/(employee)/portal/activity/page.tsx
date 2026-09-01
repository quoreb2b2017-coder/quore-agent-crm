import { Radio, LogIn, LogOut, Coffee, Play } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime, shiftWindowLabel, todayIso } from "@/lib/format";
import { formatBreakType, shiftAccountingWindowUtc } from "@/lib/shift";

type TimelineEvent = {
  time: string;
  label: string;
  icon: typeof LogIn;
};

export default async function MyActivityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const today = todayIso();
  const { start, end } = shiftAccountingWindowUtc(today);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [{ data: sessions }, { data: breaks }] = await Promise.all([
    supabase
      .from("employee_sessions")
      .select("id, started_at, ended_at")
      .eq("employee_id", ctx.employeeId)
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .order("started_at"),
    supabase
      .from("breaks")
      .select("id, started_at, ended_at, break_type")
      .eq("employee_id", ctx.employeeId)
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .order("started_at"),
  ]);

  const events: TimelineEvent[] = [];
  for (const s of sessions ?? []) {
    events.push({ time: s.started_at, label: "Logged in", icon: LogIn });
    if (s.ended_at) events.push({ time: s.ended_at, label: "Logged out", icon: LogOut });
  }
  for (const b of breaks ?? []) {
    events.push({ time: b.started_at, label: `${formatBreakType(b.break_type)} started`, icon: Coffee });
    if (b.ended_at) events.push({ time: b.ended_at, label: "Break ended", icon: Play });
  }
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Activity" description={shiftWindowLabel()} />
      <Card>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="No session recorded yet today"
              description="Clock in from Attendance to get started."
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {events.map((e, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums sm:w-52">
                    {formatTime(e.time)}
                  </span>
                  <e.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{e.label}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
