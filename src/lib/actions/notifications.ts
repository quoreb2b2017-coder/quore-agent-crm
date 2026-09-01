"use server";

import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import type { RecentNotification } from "@/lib/realtime/types";

export async function getNotificationBellState(): Promise<{
  unreadCount: number;
  recent: RecentNotification[];
}> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { unreadCount: 0, recent: [] };
  const service = createServiceClient();
  const [{ count }, { data }] = await Promise.all([
    service
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", ctx.employeeId)
      .eq("is_read", false),
    service
      .from("notifications")
      .select("id, title, body, is_read, created_at")
      .eq("employee_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    unreadCount: count ?? 0,
    recent: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
  };
}

export async function markNotificationRead(notificationId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("employee_id", ctx.employeeId);

  return { error: error?.message };
}

export async function markAllNotificationsRead() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("employee_id", ctx.employeeId)
    .eq("is_read", false);

  return { error: error?.message };
}

export async function listSentNotifications() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, employee_id, title, type, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (!rows?.length) return [];
  const ids = Array.from(new Set(rows.map((row) => row.employee_id)));
  const { data: employees } = await supabase.from("employees").select("id, full_name").in("id", ids);
  const nameById = new Map((employees ?? []).map((row) => [row.id, row.full_name]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    createdAt: row.created_at,
    recipient: nameById.get(row.employee_id) ?? "Employee",
  }));
}

export async function listNotificationRecipients() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("employment_status", "ACTIVE")
    .order("full_name");
  return data ?? [];
}
