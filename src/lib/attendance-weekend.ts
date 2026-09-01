import { createDataClient } from "@/lib/supabase/data";
import { isWeekendIso } from "@/lib/format";

type DataClient = Awaited<ReturnType<typeof createDataClient>>;

export function weekendOrRecordedStatus(date: string, status?: string | null, empty = "ABSENT") {
  if (status && status !== "ABSENT") return status;
  if (isWeekendIso(date)) return "WEEK_OFF";
  return status || empty;
}

export async function ensureWeekendOff(
  supabase: DataClient,
  employeeId: string,
  date: string
) {
  if (!isWeekendIso(date)) return;

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("employee_id", employeeId)
    .eq("attendance_date", date)
    .maybeSingle();

  if (existing) {
    if (existing.status === "ABSENT") {
      await supabase
        .from("attendance")
        .update({ status: "WEEK_OFF", source: "AUTO", notes: "Weekend" })
        .eq("id", existing.id);
    }
    return;
  }

  await supabase.from("attendance").insert({
    employee_id: employeeId,
    attendance_date: date,
    status: "WEEK_OFF",
    source: "AUTO",
    notes: "Weekend",
  });
}

export async function ensureStaffWeekendOff(
  supabase: DataClient,
  date: string,
  employeeIds: string[]
) {
  if (!isWeekendIso(date) || employeeIds.length === 0) return;

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, employee_id, status")
    .eq("attendance_date", date)
    .in("employee_id", employeeIds);

  const byEmployee = new Map((existing ?? []).map((row) => [row.employee_id, row]));
  const inserts = employeeIds
    .filter((id) => !byEmployee.has(id))
    .map((id) => ({
      employee_id: id,
      attendance_date: date,
      status: "WEEK_OFF" as const,
      source: "AUTO" as const,
      notes: "Weekend",
    }));
  const absentIds = (existing ?? [])
    .filter((row) => row.status === "ABSENT")
    .map((row) => row.id);

  if (inserts.length > 0) {
    await supabase.from("attendance").insert(inserts);
  }
  if (absentIds.length > 0) {
    await supabase
      .from("attendance")
      .update({ status: "WEEK_OFF", source: "AUTO", notes: "Weekend" })
      .in("id", absentIds);
  }
}
