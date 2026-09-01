import { NextResponse } from "next/server";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { autoGeneratePayrollMonth } from "@/lib/payroll";
import { ensureAutoSalarySlips } from "@/lib/salary-slip-generate";

export const runtime = "nodejs";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const cronOk = Boolean(secret && auth === `Bearer ${secret}`);

  if (!cronOk) {
    const ctx = await getCurrentEmployeeContext();
    if (!ctx || !isSuperAdmin(ctx.roleKey)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const slips = await ensureAutoSalarySlips(ctx.employeeId);
    return NextResponse.json({ ok: true, month: autoGeneratePayrollMonth(), count: slips.length });
  }

  const slips = await ensureAutoSalarySlips(null);
  return NextResponse.json({ ok: true, month: autoGeneratePayrollMonth(), count: slips.length });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
