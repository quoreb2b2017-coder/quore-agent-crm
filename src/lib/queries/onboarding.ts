import "server-only";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import { isStaffRole, staffDepartmentLabel } from "@/lib/permissions/roles";
import {
  ONBOARDING_BUCKET,
  WORK_STEPS,
  stepDone,
  nextOpenStep,
  onboardingProgress,
  readChecklist,
  readOffer,
  type OnboardingFacts,
  type OnboardingStatus,
  type OnboardingStepKey,
} from "@/lib/onboarding";
import type { Database } from "@/types/supabase";

export type OnboardingRecord = Database["public"]["Tables"]["employee_onboarding"]["Row"];

/** True when the error means migration 0022 has not been run yet. */
export function isMissingOnboardingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .*(employee_onboarding|onboarding_documents)|table .*(employee_onboarding|onboarding_documents)/i.test(
      error.message ?? ""
    )
  );
}

/** True when migration 0023 (offer column) has not been run yet. */
export function isMissingOfferColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    (error.code === "PGRST204" || error.code === "42703") && /offer/.test(error.message ?? "")
  );
}

type FactsInput = {
  record: OnboardingRecord | null;
  hasLogin: boolean;
  hasPayroll: boolean;
  docTypes: string[];
};

export function buildFacts({ record, hasLogin, hasPayroll, docTypes }: FactsInput): OnboardingFacts {
  return {
    hasLogin,
    hasPayroll,
    personalDetails: Boolean(
      record?.date_of_birth && record.current_address && record.emergency_contact_phone
    ),
    bankDetails: Boolean(record?.bank_account_number && record.bank_ifsc),
    docTypes,
    offer: readOffer(record?.offer),
    checklist: readChecklist(record?.checklist),
  };
}

export type ReportingOption = { value: string; label: string };

/** Active people a new joiner can report to, management first. */
export async function reportingOptions(excludeEmployeeId: string): Promise<ReportingOption[]> {
  const service = createServiceClient();
  const [{ data: employees }, { data: links }, { data: roles }] = await Promise.all([
    service
      .from("employees")
      .select("id, full_name")
      .eq("employment_status", "ACTIVE")
      .neq("id", excludeEmployeeId)
      .order("full_name"),
    service.from("employee_roles").select("employee_id, role_id").eq("is_primary", true),
    service.from("roles").select("id, role_key, display_name"),
  ]);
  const roleById = new Map((roles ?? []).map((role) => [role.id, role]));
  const roleByEmployee = new Map(
    (links ?? []).map((link) => [link.employee_id, roleById.get(link.role_id)])
  );
  const rank = (key: string) => (key === "SUPER_ADMIN" ? 0 : key === "HR" ? 1 : 2);
  return (employees ?? [])
    .map((employee) => {
      const role = roleByEmployee.get(employee.id);
      const key = role?.role_key ?? "";
      const roleLabel = isStaffRole(key)
        ? staffDepartmentLabel(key)
        : key === "SUPER_ADMIN"
          ? "Super Admin"
          : key === "HR"
            ? "HR"
            : (role?.display_name ?? "");
      return {
        rank: rank(key),
        value: employee.full_name.trim(),
        label: roleLabel ? `${employee.full_name.trim()} · ${roleLabel}` : employee.full_name.trim(),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.value.localeCompare(b.value))
    .map(({ value, label }) => ({ value, label }));
}

function statusOf(record: OnboardingRecord | null): OnboardingStatus {
  if (!record) return "NOT_STARTED";
  return record.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
}

async function departmentByEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeIds: string[]
) {
  if (employeeIds.length === 0) return new Map<string, string>();
  const [{ data: links }, { data: roles }] = await Promise.all([
    supabase
      .from("employee_roles")
      .select("employee_id, role_id")
      .eq("is_primary", true)
      .in("employee_id", employeeIds),
    supabase.from("roles").select("id, role_key"),
  ]);
  const keyById = new Map((roles ?? []).map((role) => [role.id, role.role_key]));
  const out = new Map<string, string>();
  for (const link of links ?? []) {
    const key = keyById.get(link.role_id) ?? "";
    out.set(link.employee_id, isStaffRole(key) ? staffDepartmentLabel(key) : "");
  }
  return out;
}

export type OnboardingListRow = {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  email: string;
  department: string;
  joiningDate: string;
  status: OnboardingStatus;
  currentStep: OnboardingStepKey;
  stepsDone: boolean[];
  done: number;
  total: number;
  percent: number;
};

export async function listOnboarding(): Promise<
  { rows: OnboardingListRow[]; missingTable: false } | { rows: []; missingTable: true }
> {
  const supabase = await createClient();
  const skip = excludeIds(await superAdminEmployeeIds(supabase));

  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, employee_code, email, joining_date, auth_user_id, employment_status")
    .neq("employment_status", "TERMINATED")
    .order("joining_date", { ascending: false });
  if (skip) employeesQuery = employeesQuery.not("id", "in", skip);

  const [{ data: employees }, onboarding, docs, salary] = await Promise.all([
    employeesQuery,
    supabase.from("employee_onboarding").select("*"),
    supabase.from("onboarding_documents").select("employee_id, doc_type"),
    supabase.from("salary_records").select("employee_id"),
  ]);

  if (isMissingOnboardingTable(onboarding.error) || isMissingOnboardingTable(docs.error)) {
    return { rows: [], missingTable: true };
  }

  const recordById = new Map((onboarding.data ?? []).map((row) => [row.employee_id, row]));
  const docTypesById = new Map<string, string[]>();
  for (const doc of docs.data ?? []) {
    const list = docTypesById.get(doc.employee_id) ?? [];
    list.push(doc.doc_type);
    docTypesById.set(doc.employee_id, list);
  }
  const payrollIds = new Set((salary.data ?? []).map((row) => row.employee_id));
  const departments = await departmentByEmployee(
    supabase,
    (employees ?? []).map((employee) => employee.id)
  );

  const rows = (employees ?? []).map((employee) => {
    const record = recordById.get(employee.id) ?? null;
    const facts = buildFacts({
      record,
      hasLogin: Boolean(employee.auth_user_id),
      hasPayroll: payrollIds.has(employee.id),
      docTypes: docTypesById.get(employee.id) ?? [],
    });
    const status = statusOf(record);
    return {
      employeeId: employee.id,
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      email: employee.email,
      department: departments.get(employee.id) ?? "",
      joiningDate: employee.joining_date,
      status,
      currentStep: status === "COMPLETED" ? ("review" as const) : nextOpenStep(facts),
      stepsDone: WORK_STEPS.map((step) => stepDone(step.key, facts)),
      ...onboardingProgress(facts),
    };
  });

  return { rows, missingTable: false };
}

export type OnboardingDocument = {
  id: string;
  docType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string | null;
  url: string | null;
};

export type OnboardingDetail = {
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
    phone: string | null;
    joiningDate: string;
    department: string;
  };
  record: OnboardingRecord | null;
  status: OnboardingStatus;
  facts: OnboardingFacts;
  documents: OnboardingDocument[];
  completedByName: string | null;
  offerColumnMissing: boolean;
};

export async function getOnboardingDetail(
  employeeId: string
): Promise<OnboardingDetail | "missing-table" | null> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, employee_code, email, phone, joining_date, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) return null;
  if ((await superAdminEmployeeIds(supabase)).includes(employeeId)) return null;

  const [onboarding, docs, salary, offerProbe, departments] = await Promise.all([
    supabase.from("employee_onboarding").select("*").eq("employee_id", employeeId).maybeSingle(),
    supabase
      .from("onboarding_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase.from("salary_records").select("id").eq("employee_id", employeeId).limit(1),
    supabase.from("employee_onboarding").select("offer").limit(1),
    departmentByEmployee(supabase, [employeeId]),
  ]);

  if (isMissingOnboardingTable(onboarding.error) || isMissingOnboardingTable(docs.error)) {
    return "missing-table";
  }

  const record = onboarding.data ?? null;
  const docRows = docs.data ?? [];

  const peopleIds = Array.from(
    new Set(
      [record?.completed_by, ...docRows.map((doc) => doc.uploaded_by)].filter(
        (id): id is string => Boolean(id)
      )
    )
  );
  const { data: people } = peopleIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", peopleIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((row) => [row.id, row.full_name]));

  const paths = docRows.map((doc) => doc.file_path);
  const { data: signed } = paths.length
    ? await createServiceClient().storage.from(ONBOARDING_BUCKET).createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const urlByPath = new Map(
    (signed ?? []).map((item) => [item.path ?? "", item.signedUrl ?? null])
  );

  return {
    employee: {
      id: employee.id,
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      email: employee.email,
      phone: employee.phone,
      joiningDate: employee.joining_date,
      department: departments.get(employee.id) ?? "",
    },
    record,
    status: statusOf(record),
    facts: buildFacts({
      record,
      hasLogin: Boolean(employee.auth_user_id),
      hasPayroll: (salary.data ?? []).length > 0,
      docTypes: docRows.map((doc) => doc.doc_type),
    }),
    documents: docRows.map((doc) => ({
      id: doc.id,
      docType: doc.doc_type,
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      sizeBytes: doc.size_bytes,
      createdAt: doc.created_at,
      uploadedBy: doc.uploaded_by ? nameById.get(doc.uploaded_by) ?? null : null,
      url: urlByPath.get(doc.file_path) ?? null,
    })),
    completedByName: record?.completed_by ? nameById.get(record.completed_by) ?? null : null,
    offerColumnMissing: Boolean(offerProbe.error),
  };
}
