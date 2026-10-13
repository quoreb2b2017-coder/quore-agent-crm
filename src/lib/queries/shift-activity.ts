import { createServiceClient } from "@/lib/supabase/service";
import { formatDuration, todayIso } from "@/lib/format";
import { formatBreakType, shiftAccountingWindowUtc } from "@/lib/shift";

export type ActivityTone = "login" | "logout" | "break" | "washroom" | "meeting";

export type ShiftActivityEvent = {
  id: string;
  at: string;
  employeeId: string;
  fullName: string;
  employeeCode: string;
  label: string;
  detail: string | null;
  tone: ActivityTone;
};

type Person = { id: string; fullName: string; employeeCode: string };

function durationLabel(startedAt: string, endedAt: string | null, stored: number | null) {
  const seconds =
    stored ??
    (endedAt
      ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
      : null);
  if (seconds == null) return "In progress";
  return formatDuration(seconds);
}

export async function getShiftActivity(
  people: Person[],
  shiftDate = todayIso()
): Promise<ShiftActivityEvent[]> {
  if (people.length === 0) return [];
  const ids = people.map((person) => person.id);
  const byId = new Map(people.map((person) => [person.id, person]));
  const { start, end } = shiftAccountingWindowUtc(shiftDate);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const service = createServiceClient();

  const [{ data: sessions }, { data: breaks }, { data: washrooms }, { data: meetings }] =
    await Promise.all([
      service
        .from("employee_sessions")
        .select("id, employee_id, started_at, ended_at, status")
        .in("employee_id", ids)
        .gte("started_at", startIso)
        .lt("started_at", endIso),
      service
        .from("breaks")
        .select("id, employee_id, break_type, started_at, ended_at, duration_seconds")
        .in("employee_id", ids)
        .gte("started_at", startIso)
        .lt("started_at", endIso),
      service
        .from("washroom_visits")
        .select("id, employee_id, started_at, ended_at, duration_seconds")
        .in("employee_id", ids)
        .gte("started_at", startIso)
        .lt("started_at", endIso),
      service
        .from("meetings")
        .select("id, employee_id, requested_at, started_at, ended_at, duration_seconds, status")
        .in("employee_id", ids)
        .gte("requested_at", startIso)
        .lt("requested_at", endIso),
    ]);

  const events: ShiftActivityEvent[] = [];
  const push = (
    personId: string,
    id: string,
    at: string | null,
    label: string,
    detail: string | null,
    tone: ActivityTone
  ) => {
    if (!at) return;
    const person = byId.get(personId);
    if (!person) return;
    events.push({
      id,
      at,
      employeeId: person.id,
      fullName: person.fullName,
      employeeCode: person.employeeCode,
      label,
      detail,
      tone,
    });
  };

  for (const row of sessions ?? []) {
    push(row.employee_id, `${row.id}-in`, row.started_at, "Logged in", null, "login");
    if (row.ended_at) {
      push(
        row.employee_id,
        `${row.id}-out`,
        row.ended_at,
        row.status === "TIMED_OUT" ? "Logged out (timeout)" : "Logged out",
        null,
        "logout"
      );
    }
  }

  for (const row of breaks ?? []) {
    const name = formatBreakType(row.break_type);
    push(
      row.employee_id,
      `${row.id}-start`,
      row.started_at,
      `${name} started`,
      row.ended_at ? null : "In progress",
      "break"
    );
    push(
      row.employee_id,
      `${row.id}-end`,
      row.ended_at,
      `${name} ended`,
      row.ended_at ? durationLabel(row.started_at, row.ended_at, row.duration_seconds) : null,
      "break"
    );
  }

  for (const row of washrooms ?? []) {
    push(row.employee_id, `${row.id}-start`, row.started_at, "Washroom", row.ended_at ? null : "In progress", "washroom");
    push(
      row.employee_id,
      `${row.id}-end`,
      row.ended_at,
      "Back from washroom",
      durationLabel(row.started_at, row.ended_at, row.duration_seconds),
      "washroom"
    );
  }

  for (const row of meetings ?? []) {
    push(row.employee_id, `${row.id}-ask`, row.requested_at, "Meeting requested", null, "meeting");
    if (row.started_at) {
      push(
        row.employee_id,
        `${row.id}-start`,
        row.started_at,
        "Meeting started",
        row.ended_at ? null : "In progress",
        "meeting"
      );
    }
    if (row.ended_at && row.status === "REJECTED") {
      push(row.employee_id, `${row.id}-no`, row.ended_at, "Meeting declined", null, "meeting");
    } else if (row.ended_at && !row.started_at) {
      push(row.employee_id, `${row.id}-cancel`, row.ended_at, "Meeting cancelled", null, "meeting");
    } else if (row.ended_at) {
      push(
        row.employee_id,
        `${row.id}-end`,
        row.ended_at,
        "Meeting ended",
        durationLabel(row.started_at ?? row.requested_at, row.ended_at, row.duration_seconds),
        "meeting"
      );
    }
  }

  const seen = new Set<string>();
  return events
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.label.localeCompare(b.label));
}
