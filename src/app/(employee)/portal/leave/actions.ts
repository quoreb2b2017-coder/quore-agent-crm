"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { ANNUAL_PAID_LEAVE_DAYS, leaveDaysCount } from "@/lib/leave";
import { getPaidLeaveQuota } from "@/lib/queries/leave";

export type ActionState = { error?: string; success?: boolean };

const schema = z.object({
  leaveTypeId: z.string().uuid("Select a leave type"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional(),
});

export async function applyForLeave(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { error: "Super Admin does not apply for leave." };

  const parsed = schema.safeParse({
    leaveTypeId: formData.get("leaveTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const daysCount = leaveDaysCount(parsed.data.startDate, parsed.data.endDate);
  if (daysCount <= 0) {
    return {
      error:
        "Leave is counted on working days only. Saturday and Sunday are week off.",
    };
  }

  const supabase = await createClient();
  const { data: leaveType } = await supabase
    .from("leave_types")
    .select("is_paid")
    .eq("id", parsed.data.leaveTypeId)
    .maybeSingle();
  if (leaveType?.is_paid) {
    const year = Number(parsed.data.startDate.slice(0, 4));
    const quota = await getPaidLeaveQuota({
      employeeIds: [ctx.employeeId],
      year,
      people: 1,
    });
    if (quota.used + quota.pending + daysCount > ANNUAL_PAID_LEAVE_DAYS) {
      const left = Math.max(0, ANNUAL_PAID_LEAVE_DAYS - quota.used - quota.pending);
      return {
        error: `Only ${left} of ${ANNUAL_PAID_LEAVE_DAYS} paid days remaining this year.`,
      };
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: ctx.employeeId,
    leave_type_id: parsed.data.leaveTypeId,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    days_count: daysCount,
    reason: parsed.data.reason || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/leave");
  revalidatePath("/admin/leave");
  return { success: true };
}
