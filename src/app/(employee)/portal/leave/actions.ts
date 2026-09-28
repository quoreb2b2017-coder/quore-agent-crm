"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { leaveDaysCount, packLeaveNote, UNDECIDED_LEAVE_TYPE } from "@/lib/leave";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionState = { error?: string; success?: boolean };

async function undecidedLeaveTypeId() {
  const service = createServiceClient();
  const { data: existing } = await service
    .from("leave_types")
    .select("id")
    .eq("name", UNDECIDED_LEAVE_TYPE)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created } = await service
    .from("leave_types")
    .insert({
      name: UNDECIDED_LEAVE_TYPE,
      is_paid: false,
      default_annual_days: 0,
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

const schema = z.object({
  subject: z.string().trim().min(1, "Add a subject").max(120),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().trim().min(1, "Add a reason").max(2000),
});

export async function applyForLeave(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { error: "Super Admin does not apply for leave." };

  const parsed = schema.safeParse({
    subject: formData.get("subject"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason"),
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
  const leaveTypeId = await undecidedLeaveTypeId();
  if (!leaveTypeId) return { error: "Leave types are not set up yet. Ask an admin." };

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: ctx.employeeId,
    leave_type_id: leaveTypeId,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    days_count: daysCount,
    reason: packLeaveNote(parsed.data.subject, parsed.data.reason),
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/leave");
  revalidatePath("/admin/leave");
  return { success: true };
}
