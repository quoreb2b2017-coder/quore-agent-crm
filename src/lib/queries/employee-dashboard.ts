import { createDataClient as createClient } from "@/lib/supabase/data";
import { todayIso } from "@/lib/format";

export type CommonDashboardData = {
  isClockedIn: boolean;
  isOnBreak: boolean;
  activeSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  assignedTasks: number;
  completedTasks: number;
  pendingTasks: number;
};

export async function getCommonDashboardData(employeeId: string): Promise<CommonDashboardData> {
  const supabase = await createClient();
  const today = todayIso();

  const [{ data: session }, { data: attendance }, { data: tasks }] = await Promise.all([
    supabase
      .from("employee_sessions")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("total_active_seconds, total_break_seconds, total_idle_seconds")
      .eq("employee_id", employeeId)
      .eq("attendance_date", today)
      .maybeSingle(),
    supabase.from("tasks").select("status").eq("assigned_to", employeeId),
  ]);

  let isOnBreak = false;
  if (session) {
    const { data: openBreak } = await supabase
      .from("breaks")
      .select("id")
      .eq("session_id", session.id)
      .is("ended_at", null)
      .maybeSingle();
    isOnBreak = !!openBreak;
  }

  const taskList = tasks ?? [];

  return {
    isClockedIn: !!session,
    isOnBreak,
    activeSeconds: attendance?.total_active_seconds ?? 0,
    breakSeconds: attendance?.total_break_seconds ?? 0,
    idleSeconds: attendance?.total_idle_seconds ?? 0,
    assignedTasks: taskList.length,
    completedTasks: taskList.filter((t) => t.status === "DONE").length,
    pendingTasks: taskList.filter((t) => !["DONE", "CANCELLED"].includes(t.status)).length,
  };
}

export type CampaignsDashboardData = {
  assignedCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  emailsProcessed: number;
  leadsOwned: number;
};

export async function getCampaignsDashboardData(employeeId: string): Promise<CampaignsDashboardData> {
  const supabase = await createClient();
  const [{ data: campaigns }, { count: leadsOwned }] = await Promise.all([
    supabase.from("campaigns").select("status, emails_processed").eq("owner_id", employeeId),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", employeeId),
  ]);

  const list = campaigns ?? [];
  return {
    assignedCampaigns: list.length,
    activeCampaigns: list.filter((c) => c.status === "ACTIVE").length,
    completedCampaigns: list.filter((c) => c.status === "COMPLETED").length,
    emailsProcessed: list.reduce((sum, c) => sum + c.emails_processed, 0),
    leadsOwned: leadsOwned ?? 0,
  };
}
