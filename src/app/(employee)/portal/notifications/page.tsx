import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace";

export default async function MyNotificationsPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, type, is_read, created_at")
    .eq("employee_id", ctx.employeeId)
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <NotificationsWorkspace
      canManage={false}
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
