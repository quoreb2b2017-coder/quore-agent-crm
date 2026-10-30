import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireManagement } from "@/lib/permissions/server";
import { getOnboardingDetail, reportingOptions } from "@/lib/queries/onboarding";
import { companyProfile } from "@/lib/company";
import { formatDate, formatDateTime, formatInr, initials, todayIso } from "@/lib/format";
import {
  ONBOARDING_STATUS_LABEL,
  ONBOARDING_STATUS_TONE,
  ONBOARDING_STEPS,
  SETUP_TASKS,
  isStepKey,
  joiningCountdown,
  missingRequiredDocs,
  nextOpenStep,
  onboardingDocLabel,
  onboardingProgress,
  stepDone,
  type OnboardingStepKey,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { MigrationNotice } from "../migration-notice";
import { OnboardingStepper } from "./stepper";
import { OfferStep } from "./offer-step";
import { PersonalStep } from "./personal-step";
import { DocumentsStep } from "./documents-step";
import { BankStep } from "./bank-step";
import { SetupStep } from "./setup-step";
import { ReviewStep } from "./review-step";

function cityFromAddress(address: string) {
  const parts = address.split(/[,\s]+/).filter(Boolean);
  const known = parts.find((part) => /^(pune|mumbai|bangalore|bengaluru|delhi|hyderabad|chennai|noida|gurgaon|gurugram)$/i.test(part));
  return known ? `${known.charAt(0).toUpperCase()}${known.slice(1).toLowerCase()} (Office)` : address;
}

export default async function OnboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireManagement();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getOnboardingDetail(id);

  if (detail === "missing-table") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Onboarding" />
        <MigrationNotice />
      </div>
    );
  }
  if (!detail) notFound();

  const { employee, status, facts, record } = detail;
  const today = todayIso();
  const progress = onboardingProgress(facts);
  const completed = status === "COMPLETED";
  const stepRaw = Array.isArray(query.step) ? query.step[0] : query.step;
  const current: OnboardingStepKey = isStepKey(stepRaw)
    ? stepRaw
    : completed
      ? "review"
      : nextOpenStep(facts);

  const stepState = Object.fromEntries(
    ONBOARDING_STEPS.map((step) => [step.key, step.key === "review" ? completed : stepDone(step.key, facts)])
  ) as Record<OnboardingStepKey, boolean>;

  const missingDocs = missingRequiredDocs(facts);
  const offer = facts.offer;
  const setupDone = SETUP_TASKS.filter((task) => facts.checklist[task.key]).length + (facts.hasLogin ? 1 : 0);
  const summaries: Record<OnboardingStepKey, string> = {
    offer: offer.acceptedAt
      ? `Accepted ${formatDate(offer.acceptedAt)} · ${offer.designation}${offer.annualCtc ? ` · ${formatInr(offer.annualCtc)}/yr` : ""}`
      : offer.sentAt
        ? `Sent ${formatDate(offer.sentAt)} · waiting for acceptance`
        : offer.generatedAt
          ? "Letter generated · not sent yet"
          : "Not generated yet",
    personal: facts.personalDetails
      ? `DOB ${record?.date_of_birth ? formatDate(record.date_of_birth) : "—"} · emergency ${record?.emergency_contact_phone ?? "—"}`
      : "Date of birth, address or emergency phone missing",
    documents: missingDocs.length
      ? `Missing: ${missingDocs.map(onboardingDocLabel).join(", ")}`
      : `${detail.documents.length} file${detail.documents.length === 1 ? "" : "s"} collected`,
    bank: [
      facts.bankDetails ? `${record?.bank_name ?? "Bank"} ····${(record?.bank_account_number ?? "").slice(-4)}` : "Bank details missing",
      facts.hasPayroll ? "payroll ready" : "payroll not set up",
    ].join(" · "),
    setup: `${setupDone} of ${SETUP_TASKS.length + 1} tasks done`,
    review: completed ? "Completed" : "Close onboarding",
  };

  const firstName = employee.fullName.split(/\s+/)[0] ?? employee.fullName;
  const completedLine =
    completed && record?.completed_at
      ? `Completed ${formatDateTime(record.completed_at)}${detail.completedByName ? ` by ${detail.completedByName}` : ""}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/admin/onboarding">
            <ArrowLeft className="size-4" />
            All onboarding
          </Link>
        </Button>
      </div>

      <Card className="relative overflow-hidden py-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <CardContent className="relative flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="size-14 rounded-2xl ring-4 ring-background">
                <AvatarFallback className="rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
                  {initials(employee.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{employee.fullName}</h2>
                  <Badge variant="outline" className={cn("font-medium", ONBOARDING_STATUS_TONE[status])}>
                    {ONBOARDING_STATUS_LABEL[status]}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  <span className="font-mono">{employee.employeeCode}</span>
                  {offer.designation || employee.department ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-3.5" />
                      {[offer.designation, employee.department].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    {employee.email}
                  </span>
                  {employee.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" />
                      {employee.phone}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border bg-card/80 px-4 py-2.5">
              <CalendarDays className="size-4 text-primary" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">{joiningCountdown(employee.joiningDate, today)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(employee.joiningDate)}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {completed ? "Onboarding complete" : `${progress.done} of ${progress.total} steps done`}
              </span>
              <span className="tabular-nums text-muted-foreground">{completed ? 100 : progress.percent}%</span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {ONBOARDING_STEPS.filter((step) => step.key !== "review").map((step) => (
                <div
                  key={step.key}
                  className={cn(
                    "h-1.5 rounded-full transition-colors duration-500",
                    stepState[step.key] ? "bg-success" : step.key === current ? "bg-primary/50" : "bg-muted"
                  )}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <OnboardingStepper employeeId={employee.id} current={current} stepState={stepState} />

        <div key={current} className="min-w-0">
          {current === "offer" ? (
            <OfferStep
              employeeId={employee.id}
              fullName={employee.fullName}
              offer={offer}
              joiningDate={employee.joiningDate}
              today={today}
              defaultDepartment={employee.department}
              defaultLocation={cityFromAddress(companyProfile().address)}
              reportingChoices={await reportingOptions(employee.id)}
              signedCopyUploaded={facts.docTypes.includes("OFFER_LETTER")}
              offerColumnMissing={detail.offerColumnMissing}
              done={stepState.offer}
            />
          ) : current === "personal" ? (
            <PersonalStep
              employeeId={employee.id}
              joiningDate={employee.joiningDate}
              record={record}
              done={stepState.personal}
            />
          ) : current === "documents" ? (
            <DocumentsStep
              employeeId={employee.id}
              documents={detail.documents}
              missing={missingDocs}
              done={stepState.documents}
            />
          ) : current === "bank" ? (
            <BankStep
              employeeId={employee.id}
              record={record}
              bankDone={facts.bankDetails}
              hasPayroll={facts.hasPayroll}
              offerCtc={offer.annualCtc}
              done={stepState.bank}
            />
          ) : current === "setup" ? (
            <SetupStep
              employeeId={employee.id}
              email={employee.email}
              hasLogin={facts.hasLogin}
              checklist={facts.checklist}
              done={stepState.setup}
            />
          ) : (
            <ReviewStep
              employeeId={employee.id}
              firstName={firstName}
              completed={completed}
              completedLine={completedLine}
              stepState={stepState}
              summaries={summaries}
            />
          )}
        </div>
      </div>
    </div>
  );
}
