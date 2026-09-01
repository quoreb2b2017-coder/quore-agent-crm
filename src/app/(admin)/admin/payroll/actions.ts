"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { requireSuperAdmin } from "@/lib/permissions/server";
import { todayIso } from "@/lib/format";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { refreshEmployeeSalarySlips } from "@/lib/salary-slip-generate";
import type { PayLine } from "@/lib/payroll";

export type ActionState = { error?: string; success?: boolean };

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

export async function setupPayroll(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

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

  const extraEarnings = readPayLines(formData, "extraEarningName", "extraEarningAmount");
  const extraDeductions = readPayLines(formData, "extraDeductionName", "extraDeductionAmount");

  const { error } = await supabase.from("salary_records").insert({
    employee_id: parsed.data.employeeId,
    effective_from: parsed.data.effectiveFrom,
    base_salary: parsed.data.baseSalary,
    currency: "INR",
    pay_frequency: parsed.data.payFrequency,
    components: {
      hra: parsed.data.hra ?? 0,
      allowance: parsed.data.allowance ?? 0,
      conveyance: parsed.data.conveyance ?? 0,
      extraEarnings,
      incomeTax: parsed.data.incomeTax ?? 0,
      providentFund: parsed.data.providentFund ?? 0,
      professionalTax: parsed.data.professionalTax ?? 0,
      extraDeductions,
    },
    created_by: ctx.employeeId,
  });
  if (error) return { error: error.message };

  const { error: employeeError } = await supabase
    .from("employees")
    .update({ salary: parsed.data.baseSalary })
    .eq("id", parsed.data.employeeId);
  if (employeeError) return { error: employeeError.message };

  await refreshEmployeeSalarySlips(parsed.data.employeeId, ctx.employeeId);

  revalidatePath("/admin/payroll");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/salary-slips");
  revalidatePath("/portal/salary-slips");
  return { success: true };
}
