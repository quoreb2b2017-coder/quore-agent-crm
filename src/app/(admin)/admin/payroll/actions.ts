"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, requireManagement } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { todayIso } from "@/lib/format";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { insertAndEmitNotification, notifyAdminsOfAction } from "@/lib/realtime/notify";
import { refreshEmployeeSalarySlips } from "@/lib/salary-slip-generate";
import type { PayLine } from "@/lib/payroll";
import type { Json } from "@/types/supabase";

export type ActionState = { error?: string; success?: boolean; pending?: boolean };

const schema = z.object({
  employeeId: z.string().uuid("Select an employee"),
  baseSalary: z.coerce.number().positive("Enter a valid base salary"),
  hra: z.coerce.number().min(0).optional(),
  allowance: z.coerce.number().min(0).optional(),
  conveyance: z.coerce.number().min(0).optional(),
  incomeTax: z.coerce.number().min(0).optional(),
  providentFund: z.coerce.number().min(0).optional(),
  professionalTax: z.coerce.number().min(0).optional(),
  payFrequency: z.enum(["MONTHLY", "WEEKLY", "BIWEEKLY"]),
  effectiveFrom: z.string().min(1, "Effective date is required"),
});

type SalaryRecord = {
  employee_id: string;
  effective_from: string;
  base_salary: number;
  currency: string;
  pay_frequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
  components: Json;
};

function readPayLines(formData: FormData, nameKey: string, amountKey: string): PayLine[] {
  const names = formData.getAll(nameKey).map((value) => String(value).trim());
  const amounts = formData.getAll(amountKey).map((value) => Number(value));
  const lines: PayLine[] = [];
  for (let i = 0; i < names.length; i += 1) {
    if (!names[i]) continue;
    const amount = Number.isFinite(amounts[i]) ? amounts[i] : 0;
    if (amount <= 0) continue;
    lines.push({ name: names[i].slice(0, 80), amount });
  }
  return lines;
}

function revalidatePay() {
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/salary-slips");
  revalidatePath("/portal/salary-slips");
  revalidatePath("/admin/approvals");
}

/** Writes the salary, updates the employee's current pay and rebuilds their payslips. */
async function applySalaryRecord(record: SalaryRecord, createdBy: string | null, actorId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("salary_records").insert({ ...record, created_by: createdBy });
  if (error) return error.message;

  const { error: employeeError } = await supabase
    .from("employees")
    .update({ salary: record.base_salary })
    .eq("id", record.employee_id);
  if (employeeError) return employeeError.message;

  await refreshEmployeeSalarySlips(record.employee_id, actorId);
  return null;
}

export async function setupPayroll(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await requireManagement();

  const parsed = schema.safeParse({
    employeeId: formData.get("employeeId"),
    baseSalary: formData.get("baseSalary"),
    hra: formData.get("hra") || 0,
    allowance: formData.get("allowance") || 0,
    conveyance: formData.get("conveyance") || 0,
    incomeTax: formData.get("incomeTax") || 0,
    providentFund: formData.get("providentFund") || 0,
    professionalTax: formData.get("professionalTax") || 0,
    payFrequency: formData.get("payFrequency") || "MONTHLY",
    effectiveFrom: formData.get("effectiveFrom") || todayIso(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll" };
  }

  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, parsed.data.employeeId)) {
    return { error: "Super Admin is not on payroll." };
  }

  const record: SalaryRecord = {
    employee_id: parsed.data.employeeId,
    effective_from: parsed.data.effectiveFrom,
    base_salary: parsed.data.baseSalary,
    currency: "INR",
    pay_frequency: parsed.data.payFrequency,
    components: {
      hra: parsed.data.hra ?? 0,
      allowance: parsed.data.allowance ?? 0,
      conveyance: parsed.data.conveyance ?? 0,
      extraEarnings: readPayLines(formData, "extraEarningName", "extraEarningAmount"),
      incomeTax: parsed.data.incomeTax ?? 0,
      providentFund: parsed.data.providentFund ?? 0,
      professionalTax: parsed.data.professionalTax ?? 0,
      extraDeductions: readPayLines(formData, "extraDeductionName", "extraDeductionAmount"),
    },
  };

  // HR proposes; a Super Admin decides (two-person rule). Super Admin owns pay and applies directly.
  if (!isSuperAdmin(ctx.roleKey)) {
    const { error } = await supabase.from("salary_change_requests").insert({
      employee_id: record.employee_id,
      record: record as unknown as Json,
      requested_by: ctx.employeeId,
    });
    if (error) {
      return {
        error: /salary_change_requests/i.test(error.message)
          ? "Salary approval is not set up yet. Run supabase/migrations/0043_salary_change_requests.sql in Supabase."
          : error.message,
      };
    }
    notifyAdminsOfAction(ctx, "asked to change the salary of", {
      targetEmployeeId: record.employee_id,
      detail: "It needs your approval in Approvals.",
    });
    revalidatePay();
    return { success: true, pending: true };
  }

  const failed = await applySalaryRecord(record, ctx.employeeId, ctx.employeeId);
  if (failed) return { error: failed };
  notifyAdminsOfAction(ctx, "changed the salary of", { targetEmployeeId: record.employee_id });
  revalidatePay();
  return { success: true };
}

/** Super Admin approves or rejects a salary HR asked for. Never the person who asked. */
export async function decideSalaryChange(
  requestId: string,
  approve: boolean,
  note?: string
): Promise<{ error?: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Only Super Admin can approve salary changes." };
  if (!z.string().uuid().safeParse(requestId).success) return { error: "Request not found." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("salary_change_requests")
    .select("id, employee_id, record, requested_by, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") return { error: "This request was already decided." };
  if (request.requested_by === ctx.employeeId) {
    return { error: "You asked for this change, so another Super Admin has to decide it." };
  }

  // Claim the request first, so two approvers clicking at once cannot both apply it.
  const { data: claimed, error: claimError } = await supabase
    .from("salary_change_requests")
    .update({
      status: approve ? "APPROVED" : "REJECTED",
      decided_by: ctx.employeeId,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .eq("id", request.id)
    .eq("status", "PENDING")
    .select("id");
  if (claimError) return { error: claimError.message };
  if (!claimed?.length) return { error: "This request was already decided." };

  if (approve) {
    const failed = await applySalaryRecord(
      request.record as unknown as SalaryRecord,
      request.requested_by,
      ctx.employeeId
    );
    if (failed) {
      // Put it back so it can be approved again once the problem is fixed.
      await supabase
        .from("salary_change_requests")
        .update({ status: "PENDING", decided_by: null, decided_at: null })
        .eq("id", request.id);
      return { error: failed };
    }
  }

  if (request.requested_by) {
    await insertAndEmitNotification({
      employeeId: request.requested_by,
      type: "STAFF_ACTION",
      title: approve ? "Salary change approved" : "Salary change rejected",
      body: `${ctx.fullName} (${ctx.employeeCode}) ${approve ? "approved" : "rejected"} the salary change you asked for.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
    }).catch(() => undefined);
  }
  notifyAdminsOfAction(ctx, `${approve ? "approved" : "rejected"} a salary change for`, {
    targetEmployeeId: request.employee_id,
  });
  revalidatePay();
  return {};
}
