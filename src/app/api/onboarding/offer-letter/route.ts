import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { getOnboardingDetail } from "@/lib/queries/onboarding";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { formatMinutesLabel, timeZoneShort } from "@/lib/work-settings";
import { offerReady } from "@/lib/onboarding";
import { buildOfferLetterPdf } from "@/lib/offer-letter-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employee") ?? "";
  if (!z.string().uuid().safeParse(employeeId).success) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const detail = await getOnboardingDetail(employeeId);
  if (!detail || detail === "missing-table") {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  const offer = detail.facts.offer;
  if (!offerReady(offer) || offer.annualCtc == null) {
    return NextResponse.json({ error: "Save the offer details first." }, { status: 400 });
  }

  const settings = await loadWorkSettings();
  const shiftLabel = `${formatMinutesLabel(settings.loginMinutes, settings.timeZone)} - ${formatMinutesLabel(
    settings.logoutMinutes,
    settings.timeZone
  )} ${timeZoneShort(settings.timeZone)}`;

  const bytes = await buildOfferLetterPdf({
    letterNumber: offer.letterNumber,
    issueDate: new Date(offer.generatedAt ?? Date.now()).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }),
    fullName: detail.employee.fullName,
    address: detail.record?.current_address ?? "",
    email: detail.employee.email,
    phone: detail.employee.phone ?? "",
    designation: offer.designation,
    department: offer.department,
    joiningDate: detail.employee.joiningDate,
    annualCtc: offer.annualCtc,
    probationMonths: offer.probationMonths,
    noticeDays: offer.noticeDays,
    reportingTo: offer.reportingTo,
    workLocation: offer.workLocation,
    workingDays: offer.workingDays,
    shiftLabel,
    paidLeaveDays: settings.annualPaidLeaveDays,
    validUntil: offer.validUntil,
  });

  const safeName = detail.employee.fullName.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  const inline = url.searchParams.get("download") !== "1";
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Offer-Letter-${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
