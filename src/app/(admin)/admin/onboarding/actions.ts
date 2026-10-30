"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import {
  buildFacts,
  isMissingOfferColumn,
  isMissingOnboardingTable,
} from "@/lib/queries/onboarding";
import {
  ONBOARDING_BUCKET,
  SETUP_TASKS,
  WORK_STEPS,
  readChecklist,
  readOffer,
  stepDone,
  stepLabel,
} from "@/lib/onboarding";
import { todayIso } from "@/lib/format";
import type { Database, Json } from "@/types/supabase";

export type ActionState = { error?: string; success?: boolean };

type OnboardingInsert = Database["public"]["Tables"]["employee_onboarding"]["Insert"];

const TABLE_HINT = "Onboarding tables are missing. Run supabase/migrations/0022_onboarding.sql in Supabase.";
const OFFER_HINT = "Offer letter needs one database update. Run supabase/migrations/0023_onboarding_offer.sql in Supabase.";

async function authorize(employeeId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) return { error: "Not authorized" as const };
  if (!z.string().uuid().safeParse(employeeId).success) return { error: "Invalid employee" as const };
  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, employeeId)) {
    return { error: "Onboarding is only for staff accounts." as const };
  }
  return { ctx, supabase };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function save(supabase: Supabase, row: OnboardingInsert): Promise<string | null> {
  const { error } = await supabase
    .from("employee_onboarding")
    .upsert(row, { onConflict: "employee_id" });
  if (!error) return null;
  if (isMissingOnboardingTable(error)) return TABLE_HINT;
  if (isMissingOfferColumn(error)) return OFFER_HINT;
  return error.message;
}

async function readRecord(supabase: Supabase, employeeId: string) {
  return supabase.from("employee_onboarding").select("*").eq("employee_id", employeeId).maybeSingle();
}

function revalidate(employeeId: string) {
  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${employeeId}`);
}

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ---------- Offer ---------- */

const offerSchema = z.object({
  designation: z.string().trim().min(2, "Enter the designation").max(120),
  department: z.string().trim().max(120),
  annualCtc: z.coerce
    .number({ message: "Enter the annual CTC" })
    .positive("Enter the annual CTC")
    .max(100_000_000, "CTC looks too high"),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the joining date"),
  probationMonths: z.coerce.number().int().min(0).max(12),
  noticeDays: z.coerce.number().int().min(0).max(180),
  reportingTo: z.string().trim().max(120),
  workLocation: z.string().trim().min(2, "Enter the work location").max(200),
  workingDays: z.string().trim().max(120),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the offer validity date"),
});

export async function saveOffer(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };

  const read = (name: string) => String(formData.get(name) ?? "");
  const parsed = offerSchema.safeParse({
    designation: read("designation"),
    department: read("department"),
    annualCtc: read("annualCtc").replace(/[,\s]/g, ""),
    joiningDate: read("joiningDate"),
    probationMonths: read("probationMonths") || "3",
    noticeDays: read("noticeDays") || "30",
    reportingTo: read("reportingTo"),
    workLocation: read("workLocation"),
    workingDays: read("workingDays"),
    validUntil: read("validUntil"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the offer details" };
  const data = parsed.data;

  const { data: record, error: readError } = await readRecord(auth.supabase, employeeId);
  if (isMissingOnboardingTable(readError)) return { error: TABLE_HINT };
  const current = readOffer(record?.offer);

  const { data: employee } = await auth.supabase
    .from("employees")
    .select("employee_code")
    .eq("id", employeeId)
    .maybeSingle();
  const letterNumber =
    current.letterNumber ||
    `OL/${todayIso().slice(0, 4)}/${(employee?.employee_code ?? employeeId.slice(0, 6)).toUpperCase()}`;

  const offer = {
    ...current,
    designation: data.designation,
    department: data.department,
    annualCtc: data.annualCtc,
    probationMonths: data.probationMonths,
    noticeDays: data.noticeDays,
    reportingTo: data.reportingTo,
    workLocation: data.workLocation,
    workingDays: data.workingDays || "Monday to Friday",
    validUntil: data.validUntil,
    letterNumber,
    generatedAt: new Date().toISOString(),
  };

  const error = await save(auth.supabase, { employee_id: employeeId, offer: offer as unknown as Json });
  if (error) return { error };

  const { error: joinError } = await auth.supabase
    .from("employees")
    .update({ joining_date: data.joiningDate })
    .eq("id", employeeId);
  if (joinError) return { error: joinError.message };

  revalidate(employeeId);
  return { success: true };
}

export async function setOfferStage(
  employeeId: string,
  stage: "sent" | "accepted",
  value: boolean
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };

  const { data: record, error: readError } = await readRecord(auth.supabase, employeeId);
  if (isMissingOnboardingTable(readError)) return { error: TABLE_HINT };
  const offer = readOffer(record?.offer);
  if (!offer.generatedAt) return { error: "Save the offer details first." };

  const now = new Date().toISOString();
  if (stage === "sent") {
    offer.sentAt = value ? now : null;
    if (!value) offer.acceptedAt = null;
  } else {
    offer.acceptedAt = value ? now : null;
    if (value && !offer.sentAt) offer.sentAt = now;
  }

  const error = await save(auth.supabase, { employee_id: employeeId, offer: offer as unknown as Json });
  if (error) return { error };
  revalidate(employeeId);
  return { success: true };
}

/* ---------- Personal ---------- */

const personalSchema = z.object({
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the joining date"),
  dateOfBirth: z
    .string()
    .trim()
    .refine((value) => !value || isoDate.safeParse(value).success, "Pick a valid date of birth")
    .transform((value) => value || null),
  gender: optionalText,
  personalEmail: z
    .string()
    .trim()
    .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid personal email")
    .transform((value) => value || null),
  currentAddress: optionalText,
  permanentAddress: optionalText,
  emergencyContactName: optionalText,
  emergencyContactRelation: optionalText,
  emergencyContactPhone: z
    .string()
    .trim()
    .refine((value) => !value || /^[+\d][\d\s-]{6,18}$/.test(value), "Enter a valid emergency phone")
    .transform((value) => value || null),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), "PAN should look like ABCDE1234F")
    .transform((value) => value || null),
  aadhaarNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => !value || /^\d{12}$/.test(value), "Aadhaar should be 12 digits")
    .transform((value) => value || null),
  previousCompany: optionalText,
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
});

export async function savePersonalDetails(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };

  const read = (name: string) => String(formData.get(name) ?? "");
  const sameAddress = formData.get("sameAddress") === "on";
  const parsed = personalSchema.safeParse({
    joiningDate: read("joiningDate"),
    dateOfBirth: read("dateOfBirth"),
    gender: read("gender"),
    personalEmail: read("personalEmail"),
    currentAddress: read("currentAddress"),
    permanentAddress: sameAddress ? read("currentAddress") : read("permanentAddress"),
    emergencyContactName: read("emergencyContactName"),
    emergencyContactRelation: read("emergencyContactRelation"),
    emergencyContactPhone: read("emergencyContactPhone"),
    panNumber: read("panNumber"),
    aadhaarNumber: read("aadhaarNumber"),
    previousCompany: read("previousCompany"),
    notes: read("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const data = parsed.data;

  const error = await save(auth.supabase, {
    employee_id: employeeId,
    date_of_birth: data.dateOfBirth,
    gender: data.gender,
    personal_email: data.personalEmail,
    current_address: data.currentAddress,
    permanent_address: data.permanentAddress,
    emergency_contact_name: data.emergencyContactName,
    emergency_contact_relation: data.emergencyContactRelation,
    emergency_contact_phone: data.emergencyContactPhone,
    pan_number: data.panNumber,
    aadhaar_number: data.aadhaarNumber,
    previous_company: data.previousCompany,
    notes: data.notes,
  });
  if (error) return { error };

  const { error: joinError } = await auth.supabase
    .from("employees")
    .update({ joining_date: data.joiningDate })
    .eq("id", employeeId);
  if (joinError) return { error: joinError.message };

  revalidate(employeeId);
  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: true };
}

/* ---------- Bank ---------- */

const bankSchema = z.object({
  bankAccountHolder: z.string().trim().min(2, "Enter the account holder name").max(120),
  bankName: z.string().trim().min(2, "Enter the bank name").max(120),
  bankAccountNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^\d{6,20}$/.test(value), "Account number should be 6–20 digits"),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value), "IFSC should look like HDFC0001234"),
});

export async function saveBankDetails(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };

  const read = (name: string) => String(formData.get(name) ?? "");
  const parsed = bankSchema.safeParse({
    bankAccountHolder: read("bankAccountHolder"),
    bankName: read("bankName"),
    bankAccountNumber: read("bankAccountNumber"),
    bankIfsc: read("bankIfsc"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the bank details" };
  const data = parsed.data;

  const error = await save(auth.supabase, {
    employee_id: employeeId,
    bank_account_holder: data.bankAccountHolder,
    bank_name: data.bankName,
    bank_account_number: data.bankAccountNumber,
    bank_ifsc: data.bankIfsc,
  });
  if (error) return { error };

  revalidate(employeeId);
  return { success: true };
}

/* ---------- First week ---------- */

export async function setSetupTask(
  employeeId: string,
  key: string,
  done: boolean
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };
  if (!SETUP_TASKS.some((task) => task.key === key)) return { error: "Unknown task" };

  const { data: record, error: readError } = await readRecord(auth.supabase, employeeId);
  if (isMissingOnboardingTable(readError)) return { error: TABLE_HINT };

  const checklist = readChecklist(record?.checklist);
  if (done) checklist[key] = true;
  else delete checklist[key];

  const error = await save(auth.supabase, { employee_id: employeeId, checklist });
  if (error) return { error };
  revalidate(employeeId);
  return { success: true };
}

/* ---------- Finish ---------- */

export async function setOnboardingCompleted(
  employeeId: string,
  completed: boolean
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };
  const { ctx, supabase } = auth;

  if (completed) {
    const [{ data: record, error: readError }, { data: employee }, { data: docs }, { data: salary }] =
      await Promise.all([
        readRecord(supabase, employeeId),
        supabase.from("employees").select("auth_user_id").eq("id", employeeId).maybeSingle(),
        supabase.from("onboarding_documents").select("doc_type").eq("employee_id", employeeId),
        supabase.from("salary_records").select("id").eq("employee_id", employeeId).limit(1),
      ]);
    if (isMissingOnboardingTable(readError)) return { error: TABLE_HINT };
    const facts = buildFacts({
      record: record ?? null,
      hasLogin: Boolean(employee?.auth_user_id),
      hasPayroll: (salary ?? []).length > 0,
      docTypes: (docs ?? []).map((doc) => doc.doc_type),
    });
    const pending = WORK_STEPS.filter((step) => !stepDone(step.key, facts)).map((step) =>
      stepLabel(step.key)
    );
    if (pending.length > 0) return { error: `Finish these steps first: ${pending.join(", ")}.` };
  }

  const error = await save(supabase, {
    employee_id: employeeId,
    status: completed ? "COMPLETED" : "IN_PROGRESS",
    completed_at: completed ? new Date().toISOString() : null,
    completed_by: completed ? ctx.employeeId : null,
  });
  if (error) return { error };

  revalidate(employeeId);
  return { success: true };
}

export async function deleteOnboardingDocument(
  employeeId: string,
  documentId: string
): Promise<ActionState> {
  const auth = await authorize(employeeId);
  if ("error" in auth) return { error: auth.error };

  const { data: doc } = await auth.supabase
    .from("onboarding_documents")
    .select("id, file_path")
    .eq("id", documentId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  const { error } = await auth.supabase.from("onboarding_documents").delete().eq("id", doc.id);
  if (error) return { error: error.message };
  await createServiceClient().storage.from(ONBOARDING_BUCKET).remove([doc.file_path]);

  revalidate(employeeId);
  return { success: true };
}
