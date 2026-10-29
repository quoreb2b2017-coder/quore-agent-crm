import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { autoGeneratePayrollMonth } from "@/lib/payroll";
import { ensureAutoSalarySlips } from "@/lib/salary-slip-generate";

export const runtime = "nodejs";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const cronOk = Boolean(secret && auth && safeEqual(auth, `Bearer ${secret}`));

  if (!cronOk) {
    const ctx = await getCurrentEmployeeContext();
    if (!ctx || !isManagement(ctx.roleKey)) {
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
