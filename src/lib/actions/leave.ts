"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { insertAndEmitNotification } from "@/lib/realtime/notify";
import { eachDateInclusive, isWeekendIso, todayIso } from "@/lib/format";
import { isUndecidedLeaveType, leaveDaysCount, packLeaveNote, UNDECIDED_LEAVE_TYPE } from "@/lib/leave";
import { getLeaveBalanceRows, getPaidLeaveQuota, primaryPaidLeaveTypeId } from "@/lib/queries/leave";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { ensureWeekendOff } from "@/lib/attendance-weekend";
import { closeWorkSession } from "@/lib/actions/attendance";

function revalidateLeave() {
  revalidatePath("/admin/leave");
  revalidatePath("/portal/leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/portal/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/dashboard");
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

  if (dates.includes(todayIso())) {
    const closed = await closeWorkSession(request.employee_id, "ENDED");
    if (closed.error) return { error: closed.error, paid, typeName, payLabel };
  }

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
      const { error } = await supabase
        .from("attendance")
        .update({ status: "ON_LEAVE", notes, source: "AUTO" })
        .eq("id", existing.id);
      if (error) return { error: error.message, paid, typeName, payLabel };
    } else {
      const { error } = await supabase.from("attendance").insert({
        employee_id: request.employee_id,
        attendance_date: attendanceDate,
        status: "ON_LEAVE",
        notes,
        source: "AUTO",
      });
      if (error) return { error: error.message, paid, typeName, payLabel };
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
    const { error } = await supabase
      .from("leave_balances")
      .update({ used_days: Number(balance.used_days) + days })
      .eq("id", balance.id);
    if (error) return { error: error.message, paid, typeName, payLabel };
  } else {
    const { error } = await supabase.from("leave_balances").insert({
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      year,
      allocated_days: paid
        ? (await loadWorkSettings()).annualPaidLeaveDays
        : Number(leaveType?.default_annual_days ?? 0),
      used_days: days,
    });
    if (error) return { error: error.message, paid, typeName, payLabel };
  }

  return { error: undefined, paid, typeName, payLabel };
}

export async function reviewLeaveRequest(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  leaveTypeId?: string
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

  let assignedTypeId = request.leave_type_id;
  if (decision === "APPROVED") {
    if (!leaveTypeId) return { error: "Select a leave type before approving." };
    const { data: leaveType } = await supabase
      .from("leave_types")
      .select("id, name, is_paid")
      .eq("id", leaveTypeId)
      .maybeSingle();
    if (!leaveType || isUndecidedLeaveType(leaveType.name)) {
      return { error: "Select whether this leave is paid or unpaid." };
    }
    if (leaveType.is_paid) {
      const year = Number(request.start_date.slice(0, 4));
      const quota = await getPaidLeaveQuota({
        employeeIds: [request.employee_id],
        year,
        people: 1,
      });
      if (quota.used + Number(request.days_count) > quota.available) {
        const left = Math.max(0, quota.available - quota.used);
        return { error: `Only ${left} of ${quota.available} paid days remaining this year.` };
      }
    }
    assignedTypeId = leaveType.id;
  }

  let body = `Your leave request was ${decision.toLowerCase()}.`;
  let title = decision === "APPROVED" ? "Leave approved" : "Leave rejected";

  if (decision === "APPROVED") {
    const applied = await applyApprovedLeave(supabase, {
      ...request,
      leave_type_id: assignedTypeId,
    });
    if (applied.error) return { error: applied.error };
    title = `${applied.payLabel} leave approved`;
    body = `Your ${applied.typeName} (${applied.payLabel.toLowerCase()}) was approved. Working days are marked on leave; Saturday and Sunday stay week off.`;
  }

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: decision,
      leave_type_id: assignedTypeId,
      reviewed_by: ctx.employeeId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "PENDING")
    .select("id");

  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Could not save this decision. Refresh the page and try again." };

  try {
    await insertAndEmitNotification({
      employeeId: request.employee_id,
      type: "LEAVE_UPDATE",
      title,
      body,
    });
  } catch {
    /* the decision is already saved */
  }

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
  subject: z.string().optional(),
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
    subject: formData.get("subject") || undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data: chosenType } = await (await createClient())
    .from("leave_types")
    .select("name")
    .eq("id", parsed.data.leaveTypeId)
    .maybeSingle();
  if (!chosenType || chosenType.name === UNDECIDED_LEAVE_TYPE) {
    return { error: "Select whether this leave is paid or unpaid." };
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
      reason: packLeaveNote(parsed.data.subject ?? "", parsed.data.reason ?? "") || null,
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

async function saveAllocatedDays(
  rows: { employeeId: string; allocated: number }[],
  year: number
): Promise<{ error?: string }> {
  const typeId = await primaryPaidLeaveTypeId();
  if (!typeId) return { error: "Add a paid leave type before changing balances." };
  if (rows.length === 0) return {};
  const supabase = await createClient();
  const ids = rows.map((row) => row.employeeId);
  const { data: existing, error: loadError } = await supabase
    .from("leave_balances")
    .select("id, employee_id")
    .eq("leave_type_id", typeId)
    .eq("year", year)
    .in("employee_id", ids);
  if (loadError) return { error: loadError.message };

  const byEmployee = new Map((existing ?? []).map((row) => [row.employee_id, row.id]));
  for (const row of rows) {
    const balanceId = byEmployee.get(row.employeeId);
    if (balanceId) {
      const { error } = await supabase
        .from("leave_balances")
        .update({ allocated_days: row.allocated })
        .eq("id", balanceId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("leave_balances").insert({
        employee_id: row.employeeId,
        leave_type_id: typeId,
        year,
        allocated_days: row.allocated,
        used_days: 0,
      });
      if (error) return { error: error.message };
    }
  }
  return {};
}

/** Sets how many paid days are left. Days already approved stay counted as used. */
export async function setLeaveRemaining(
  employeeId: string,
  year: number,
  remaining: number
): Promise<{ error?: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };
  if (!Number.isFinite(remaining) || remaining < 0 || remaining > 366) {
    return { error: "Remaining days must be between 0 and 366." };
  }
  const [row] = await getLeaveBalanceRows(
    [{ id: employeeId, full_name: "", employee_code: "" }],
    year
  );
  const saved = await saveAllocatedDays(
    [{ employeeId, allocated: (row?.used ?? 0) + remaining }],
    year
  );
  if (saved.error) return saved;
  revalidateLeave();
  return {};
}

/** Gives every employee the same number of paid days left. */
export async function setLeaveRemainingForAll(
  year: number,
  remaining: number
): Promise<{ error?: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };
  if (!Number.isFinite(remaining) || remaining < 0 || remaining > 366) {
    return { error: "Remaining days must be between 0 and 366." };
  }
  const employees = await listWatchableEmployees();
  const rows = await getLeaveBalanceRows(employees, year);
  const saved = await saveAllocatedDays(
    rows.map((row) => ({ employeeId: row.employeeId, allocated: row.used + remaining })),
    year
  );
  if (saved.error) return saved;
  revalidateLeave();
  return {};
}
