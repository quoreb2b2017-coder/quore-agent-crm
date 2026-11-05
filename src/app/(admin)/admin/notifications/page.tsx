import { requireViewer } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace";
import { formatBreakDuration } from "@/lib/format";

const LIST_SIZE = 200;

export default async function AdminNotificationsPage() {
  const { ctx, seesAll } = await requireViewer();
  const supabase = await createClient();
  const [{ data }, { data: employees }, { data: meetings }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, type, is_read, created_at")
      .eq("employee_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(LIST_SIZE),
    seesAll
      ? supabase.from("employees").select("id, full_name, employee_code")
      : Promise.resolve({ data: [] }),
    seesAll
      ? supabase
          .from("meetings")
          .select("id, employee_id, status, started_at, ended_at, approved_by, approved_at, duration_seconds")
          .or("started_at.not.is.null,status.eq.REJECTED")
          .order("requested_at", { ascending: false })
          .limit(LIST_SIZE)
      : Promise.resolve({ data: [] }),
  ]);

  // A name shared by two people cannot say which one is meant, so it gets no link.
  const nameCounts = new Map<string, number>();
  for (const row of employees ?? []) nameCounts.set(row.full_name, (nameCounts.get(row.full_name) ?? 0) + 1);
  const employeeIdByName = Object.fromEntries(
    (employees ?? []).filter((row) => nameCounts.get(row.full_name) === 1).map((row) => [row.full_name, row.id])
  );
  const personById = new Map((employees ?? []).map((row) => [row.id, row]));

  // Decisions are read from the meeting itself, so every one shows, old or new, and none can be missed.
  const decisions = (meetings ?? []).flatMap((meeting) => {
    const person = personById.get(meeting.employee_id);
    if (!person) return [];
    const accepted = Boolean(meeting.started_at);
    const decidedAt = meeting.approved_at ?? meeting.started_at ?? meeting.ended_at;
    if (!decidedAt) return [];
    const decidedBy = meeting.approved_by ? personById.get(meeting.approved_by)?.full_name : null;
    const state = !accepted
      ? ""
      : meeting.ended_at
        ? ` Ended after ${formatBreakDuration(meeting.duration_seconds ?? 0)}.`
        : " Still in the meeting.";
    return [
      {
        id: `meeting-${meeting.id}`,
        title: `${person.full_name} meeting ${accepted ? "accepted" : "not accepted"}`,
        body: `${person.full_name} (${person.employee_code}) meeting ${accepted ? "accepted" : "not accepted"}${decidedBy ? ` by ${decidedBy}` : ""}.${state}`,
        type: accepted ? "MEETING_ACCEPTED" : "MEETING_REJECTED",
        isRead: true,
        createdAt: decidedAt,
      },
    ];
  });

  const inbox = [
    ...(data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
    ...decisions,
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <NotificationsWorkspace canManage={seesAll} employeeIdByName={employeeIdByName} inbox={inbox} />;
}
