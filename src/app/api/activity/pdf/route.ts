import { NextResponse } from "next/server";
import { buildActivityPdf } from "@/lib/activity-pdf";
import { companyProfile } from "@/lib/company";
import { isUuid } from "@/lib/attendance-period";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { getShiftActivity, resolveActivityRange } from "@/lib/queries/shift-activity";

export const runtime = "nodejs";

const PDF_CAP = 2000;

export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) {
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = resolveActivityRange(
    url.searchParams.get("mode") ?? undefined,
    url.searchParams.get("days") ?? undefined,
    url.searchParams.get("month") ?? undefined
  );
  const requested = url.searchParams.get("employee") ?? "";
  const employeeId = isUuid(requested) ? requested : null;
  const people = await listWatchableEmployees();
  const picked = employeeId ? people.filter((person) => person.id === employeeId) : people;
  const peopleInput = picked.map((person) => ({
    id: person.id,
    fullName: person.full_name,
    employeeCode: person.employee_code,
  }));
  const [events, productivity] = await Promise.all([
    getShiftActivity(peopleInput, range.start, range.end),
    getProductivityReport(picked, range.start, range.end),
  ]);
  const daysById = new Map(productivity.map((row) => [row.employee.id, row.days]));
  const newestFirst = [...events].reverse();
  const shown = newestFirst.slice(0, PDF_CAP);
  const who = picked.length === 1 ? picked[0].full_name.replace(/\s+/g, "-") : "all";
  const bytes = await buildActivityPdf({
    company: companyProfile().name,
    rangeLabel: `${range.label} (${range.start} to ${range.end})`,
    people: peopleInput.map((person) => ({
      ...person,
      days: daysById.get(person.id) ?? [],
    })),
    events: shown,
    truncated: newestFirst.length > PDF_CAP,
  });
  const filename = `activity-${who}-${range.start}-to-${range.end}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
