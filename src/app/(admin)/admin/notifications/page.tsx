import { requireViewer } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace";

export default async function AdminNotificationsPage() {
  const { ctx, seesAll } = await requireViewer();
  const supabase = await createClient();
  const [{ data }, { data: employees }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, type, is_read, created_at")
      .eq("employee_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(40),
    seesAll ? supabase.from("employees").select("id, full_name") : Promise.resolve({ data: [] }),
  ]);

  // A name shared by two people cannot say which one is meant, so it gets no link.
  const nameCounts = new Map<string, number>();
  for (const row of employees ?? []) nameCounts.set(row.full_name, (nameCounts.get(row.full_name) ?? 0) + 1);
  const employeeIdByName = Object.fromEntries(
    (employees ?? []).filter((row) => nameCounts.get(row.full_name) === 1).map((row) => [row.full_name, row.id])
  );

  return (
    <NotificationsWorkspace
      canManage={seesAll}
      employeeIdByName={employeeIdByName}
      inbox={(data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        type: row.type,
        isRead: row.is_read,
        createdAt: row.created_at,
      }))}
    />
  );
}
