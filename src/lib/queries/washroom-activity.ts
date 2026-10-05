import { createServiceClient } from "@/lib/supabase/service";
import { todayIso } from "@/lib/format";
import { shiftAccountingWindowUtc } from "@/lib/shift";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";

export type WashroomVisitDetail = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
};

export type EmployeeWashroomActivity = {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  visitCount: number;
  totalSeconds: number;
  open: boolean;
  visits: WashroomVisitDetail[];
};

export async function getAdminWashroomActivity(
  shiftDate = todayIso()
): Promise<EmployeeWashroomActivity[]> {
  const people = await listWatchableEmployees();
  if (people.length === 0) return [];
  const { start, end } = shiftAccountingWindowUtc(shiftDate);
  const { data } = await createServiceClient()
    .from("washroom_visits")
    .select("id, employee_id, started_at, ended_at, duration_seconds")
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString())
    .in(
      "employee_id",
      people.map((person) => person.id)
    )
    .order("started_at", { ascending: false });

  const now = Date.now();
  const byEmployee = new Map<string, WashroomVisitDetail[]>();
  for (const row of data ?? []) {
    const duration =
      row.duration_seconds ??
      Math.max(
        0,
        Math.floor(
          ((row.ended_at ? new Date(row.ended_at).getTime() : now) - new Date(row.started_at).getTime()) /
            1000
        )
      );
    const list = byEmployee.get(row.employee_id) ?? [];
    list.push({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: duration,
    });
    byEmployee.set(row.employee_id, list);
  }

  return people
    .map((person) => {
      const visits = byEmployee.get(person.id) ?? [];
      return {
        employeeId: person.id,
        fullName: person.full_name,
        employeeCode: person.employee_code,
        visitCount: visits.length,
        totalSeconds: visits.reduce((sum, visit) => sum + visit.durationSeconds, 0),
        open: visits.some((visit) => visit.endedAt == null),
        visits,
      };
    })
    .filter((row) => row.visitCount > 0)
    .sort((a, b) => b.visitCount - a.visitCount || b.totalSeconds - a.totalSeconds);
}
