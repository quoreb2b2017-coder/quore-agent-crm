"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { insertAndEmitNotification } from "@/lib/realtime/notify";
import { eachDateInclusive, isWeekendIso, todayIso } from "@/lib/format";
import { ANNUAL_PAID_LEAVE_DAYS, leaveDaysCount } from "@/lib/leave";
import { ensureWeekendOff } from "@/lib/attendance-weekend";

function revalidateLeave() {
  revalidatePath("/admin/leave");
  revalidatePath("/portal/leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/portal/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/dashboard");
}

async function endOpenSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string
) {
  const { data: session } = await supabase
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return;

  const now = new Date().toISOString();
  const { data: openBreak } = await supabase
    .from("breaks")
    .select("id, started_at")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();

  if (openBreak) {
    const durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(openBreak.started_at).getTime()) / 1000)
    );
    await supabase
      .from("breaks")
      .update({ ended_at: now, duration_seconds: durationSeconds })
      .eq("id", openBreak.id);
  }

  await supabase
    .from("employee_sessions")
    .update({ ended_at: now, status: "ENDED" })
    .eq("id", session.id);
}

async function applyApprovedLeave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    days_count: number;
  }
) {
  const { data: leaveType } = await supabase
    .from("leave_types")
    .select("name, is_paid, default_annual_days")
    .eq("id", request.leave_type_id)
    .single();

  const paid = leaveType?.is_paid ?? true;
  const typeName = leaveType?.name ?? "Leave";
  const payLabel = paid ? "Paid" : "Unpaid";
  const notes = `${payLabel}: ${typeName}`;
  const dates = eachDateInclusive(request.start_date, request.end_date);

  for (const attendanceDate of dates) {
    if (isWeekendIso(attendanceDate)) {
      await ensureWeekendOff(supabase, request.employee_id, attendanceDate);
      continue;
    }

    const { data: existing } = await supabase
      .from("attendance")
      .select("id")
      .eq("employee_id", request.employee_id)
      .eq("attendance_date", attendanceDate)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("attendance")
        .update({ status: "ON_LEAVE", notes, source: "AUTO" })
        .eq("id", existing.id);
    } else {
      await supabase.from("attendance").insert({
        employee_id: request.employee_id,
        attendance_date: attendanceDate,
        status: "ON_LEAVE",
        notes,
        source: "AUTO",
      });
    }
  }

  const year = Number(request.start_date.slice(0, 4));
  const days = Number(request.days_count);
  const { data: balance } = await supabase
    .from("leave_balances")
    .select("id, used_days")
    .eq("employee_id", request.employee_id)
    .eq("leave_type_id", request.leave_type_id)
    .eq("year", year)
    .maybeSingle();

  if (balance) {
    await supabase
      .from("leave_balances")
      .update({ used_days: Number(balance.used_days) + days })
      .eq("id", balance.id);
  } else {
    await supabase.from("leave_balances").insert({
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      year,
      allocated_days: paid ? ANNUAL_PAID_LEAVE_DAYS : Number(leaveType?.default_annual_days ?? 0),
      used_days: days,
    });
  }

  if (dates.includes(todayIso())) {
    await endOpenSession(supabase, request.employee_id);
  }

  return { paid, typeName, payLabel };
}

export async function reviewLeaveRequest(
  requestId: string,
  decision: "APPROVED" | "REJECTED"
) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const supabase = await createClient();
  const { data: request, error: loadError } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status")
    .eq("id", requestId)
    .single();

  if (loadError || !request) return { error: loadError?.message ?? "Leave request not found" };
  if (request.status !== "PENDING") return { error: "This request was already reviewed." };

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: decision,
      reviewed_by: ctx.employeeId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "PENDING");

  if (error) return { error: error.message };

  let body = `Your leave request was ${decision.toLowerCase()}.`;
  let title = decision === "APPROVED" ? "Leave approved" : "Leave rejected";

  if (decision === "APPROVED") {
    const applied = await applyApprovedLeave(supabase, request);
    title = `${applied.payLabel} leave approved`;
    body = `Your ${applied.typeName} (${applied.payLabel.toLowerCase()}) was approved. Working days are marked on leave; Saturday and Sunday stay week off.`;
  }

  await insertAndEmitNotification({
    employeeId: request.employee_id,
    type: "LEAVE_UPDATE",
    title,
    body,
  });

  revalidateLeave();
  return {};
}

async function revertApprovedLeave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    days_count: number;
  }
) {
  const dates = eachDateInclusive(request.start_date, request.end_date);
  if (dates.length > 0) {
    const { data: rows } = await supabase
      .from("attendance")
      .select("id, first_check_in")
      .eq("employee_id", request.employee_id)
      .eq("status", "ON_LEAVE")
      .eq("source", "AUTO")
      .in("attendance_date", dates);

    for (const row of rows ?? []) {
      if (row.first_check_in) {
        await supabase
          .from("attendance")
          .update({ status: "PRESENT", notes: null })
          .eq("id", row.id);
      } else {
        await supabase.from("attendance").delete().eq("id", row.id);
      }
    }
  }

  const year = Number(request.start_date.slice(0, 4));
  const { data: balance } = await supabase
    .from("leave_balances")
    .select("id, used_days")
    .eq("employee_id", request.employee_id)
    .eq("leave_type_id", request.leave_type_id)
    .eq("year", year)
    .maybeSingle();

  if (balance) {
    await supabase
      .from("leave_balances")
      .update({ used_days: Math.max(0, Number(balance.used_days) - Number(request.days_count)) })
      .eq("id", balance.id);
  }
}

const updateSchema = z.object({
  requestId: z.string().uuid(),
  leaveTypeId: z.string().uuid("Select a leave type"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional(),
});

export async function updateLeaveRequest(formData: FormData) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const parsed = updateSchema.safeParse({
    requestId: formData.get("requestId"),
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
    return { error: "Leave is counted on working days only. Saturday and Sunday are week off." };
  }

  const supabase = await createClient();
  const { data: request, error: loadError } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status")
    .eq("id", parsed.data.requestId)
    .single();

  if (loadError || !request) return { error: loadError?.message ?? "Leave request not found" };

  if (request.status === "APPROVED") {
    await revertApprovedLeave(supabase, request);
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      leave_type_id: parsed.data.leaveTypeId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      days_count: daysCount,
      reason: parsed.data.reason || null,
    })
    .eq("id", request.id);

  if (error) return { error: error.message };

  if (request.status === "APPROVED") {
    await applyApprovedLeave(supabase, {
      employee_id: request.employee_id,
      leave_type_id: parsed.data.leaveTypeId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      days_count: daysCount,
    });
  }

  await insertAndEmitNotification({
    employeeId: request.employee_id,
    type: "LEAVE_UPDATE",
    title: "Leave request updated",
    body: "A Super Admin updated your leave request.",
  });

  revalidateLeave();
  return {};
}

export async function deleteLeaveRequest(requestId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const supabase = await createClient();
  const { data: request, error: loadError } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status")
    .eq("id", requestId)
    .single();

  if (loadError || !request) return { error: loadError?.message ?? "Leave request not found" };

  if (request.status === "APPROVED") {
    await revertApprovedLeave(supabase, request);
  }

  const { error } = await supabase.from("leave_requests").delete().eq("id", request.id);
  if (error) return { error: error.message };

  await insertAndEmitNotification({
    employeeId: request.employee_id,
    type: "LEAVE_UPDATE",
    title: "Leave request removed",
    body: "A Super Admin deleted your leave request.",
  });

  revalidateLeave();
  return {};
}
