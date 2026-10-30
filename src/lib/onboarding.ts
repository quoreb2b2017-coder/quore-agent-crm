export const ONBOARDING_BUCKET = "onboarding-documents";
export const ONBOARDING_DOC_MAX_BYTES = 5 * 1024 * 1024;

export const ONBOARDING_DOC_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ONBOARDING_DOC_TYPES = [
  { key: "AADHAAR", label: "Aadhaar card", hint: "Front and back", required: true },
  { key: "PAN", label: "PAN card", hint: "Clear photo or scan", required: true },
  { key: "PHOTO", label: "Passport photo", hint: "Recent, plain background", required: true },
  { key: "EDUCATION", label: "Education certificate", hint: "Highest qualification", required: true },
  { key: "EXPERIENCE", label: "Experience / relieving letter", hint: "Skip for freshers", required: false },
  { key: "BANK_PROOF", label: "Cancelled cheque / passbook", hint: "Shows account and IFSC", required: false },
  { key: "OFFER_LETTER", label: "Signed offer letter", hint: "Candidate's signed copy", required: false },
  { key: "OTHER", label: "Other", hint: "Anything else", required: false },
] as const;

export type OnboardingDocType = (typeof ONBOARDING_DOC_TYPES)[number]["key"];

export function onboardingDocLabel(key: string) {
  return ONBOARDING_DOC_TYPES.find((item) => item.key === key)?.label ?? "Document";
}

export const REQUIRED_DOC_TYPES: string[] = ONBOARDING_DOC_TYPES.filter((item) => item.required).map(
  (item) => item.key
);

/* ---------- Offer letter ---------- */

export type OfferDetails = {
  designation: string;
  department: string;
  annualCtc: number | null;
  probationMonths: number;
  noticeDays: number;
  reportingTo: string;
  workLocation: string;
  workingDays: string;
  validUntil: string;
  letterNumber: string;
  generatedAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
};

export const EMPTY_OFFER: OfferDetails = {
  designation: "",
  department: "",
  annualCtc: null,
  probationMonths: 3,
  noticeDays: 30,
  reportingTo: "",
  workLocation: "",
  workingDays: "Monday to Friday",
  validUntil: "",
  letterNumber: "",
  generatedAt: null,
  sentAt: null,
  acceptedAt: null,
};

export function readOffer(value: unknown): OfferDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_OFFER };
  const raw = value as Record<string, unknown>;
  const text = (key: string, fallback = "") => (typeof raw[key] === "string" ? (raw[key] as string) : fallback);
  const num = (key: string, fallback: number) =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : fallback;
  const stamp = (key: string) => (typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : null);
  return {
    designation: text("designation"),
    department: text("department"),
    annualCtc: typeof raw.annualCtc === "number" && raw.annualCtc > 0 ? raw.annualCtc : null,
    probationMonths: num("probationMonths", EMPTY_OFFER.probationMonths),
    noticeDays: num("noticeDays", EMPTY_OFFER.noticeDays),
    reportingTo: text("reportingTo"),
    workLocation: text("workLocation"),
    workingDays: text("workingDays", EMPTY_OFFER.workingDays),
    validUntil: text("validUntil"),
    letterNumber: text("letterNumber"),
    generatedAt: stamp("generatedAt"),
    sentAt: stamp("sentAt"),
    acceptedAt: stamp("acceptedAt"),
  };
}

export type ChoiceGroup = { label: string; options: string[] };

export const DESIGNATION_GROUPS: ChoiceGroup[] = [
  {
    label: "Sales & lead generation",
    options: [
      "Sales Development Representative",
      "Business Development Executive",
      "Lead Generation Executive",
      "Appointment Setter",
      "Inside Sales Executive",
      "Senior Business Development Executive",
      "Team Lead - Sales",
    ],
  },
  {
    label: "Data & research",
    options: [
      "Data Research Analyst",
      "Database Executive",
      "Database Administrator",
      "Lead Research Specialist",
      "Quality Analyst",
    ],
  },
  {
    label: "Marketing",
    options: [
      "Email Marketing Executive",
      "Email Marketing Specialist",
      "Campaign Manager",
      "Digital Marketing Executive",
      "Content Writer",
    ],
  },
  {
    label: "Support & management",
    options: [
      "HR Executive",
      "HR Manager",
      "Operations Executive",
      "Operations Manager",
      "Accounts Executive",
      "IT Support Executive",
      "Trainee",
      "Intern",
    ],
  },
];

export const DEPARTMENT_CHOICES = [
  "Agent",
  "Database Admin",
  "Email Marketing",
  "Sales",
  "Human Resources",
  "Operations",
  "Accounts",
  "IT",
];

export const WORK_LOCATION_CHOICES = [
  "Pune (Office)",
  "Hybrid - Pune",
  "Remote (Work from home)",
];

export const WORKING_DAYS_CHOICES = [
  "Monday to Friday",
  "Monday to Saturday",
  "Monday to Saturday (alternate Saturdays off)",
  "5 days a week (rotational weekly off)",
  "6 days a week (rotational weekly off)",
];

export const PROBATION_CHOICES = [0, 1, 2, 3, 6];
export const NOTICE_CHOICES = [15, 30, 45, 60, 90];
export const OFFER_VALIDITY_DAYS = [3, 7, 10, 15, 30];
export const CTC_PRESETS = [180000, 240000, 300000, 360000, 480000, 600000];

export const GENDER_CHOICES = ["Male", "Female", "Other", "Prefer not to say"];

export const RELATION_CHOICES = [
  "Father",
  "Mother",
  "Spouse",
  "Brother",
  "Sister",
  "Son",
  "Daughter",
  "Guardian",
  "Friend",
  "Relative",
];

export const BANK_CHOICES = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Bank of Baroda",
  "Punjab National Bank",
  "Canara Bank",
  "Union Bank of India",
  "Bank of Maharashtra",
  "IDFC FIRST Bank",
  "IndusInd Bank",
  "Yes Bank",
  "Federal Bank",
  "AU Small Finance Bank",
  "Indian Bank",
  "Central Bank of India",
  "Bank of India",
];

export function offerReady(offer: OfferDetails) {
  return Boolean(offer.designation && offer.annualCtc && offer.validUntil);
}

/* ---------- Steps ---------- */

export type ChecklistState = Record<string, boolean>;

export function readChecklist(value: unknown): ChecklistState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ChecklistState = {};
  for (const [key, done] of Object.entries(value as Record<string, unknown>)) {
    if (done === true) out[key] = true;
  }
  return out;
}

/** Hand-ticked tasks in the "First week" step. */
export const SETUP_TASKS = [
  { key: "tools", label: "Work email & tools access", hint: "Email, CRM and anything the role needs." },
  { key: "policies", label: "Policies explained", hint: "Shift timing, breaks, leave and attendance rules." },
  { key: "induction", label: "Team intro & induction", hint: "Meet the team and the reporting manager." },
  { key: "training", label: "Role training done", hint: "Process walkthrough for their work." },
] as const;

export type OnboardingFacts = {
  hasLogin: boolean;
  hasPayroll: boolean;
  personalDetails: boolean;
  bankDetails: boolean;
  docTypes: string[];
  offer: OfferDetails;
  checklist: ChecklistState;
};

export const ONBOARDING_STEPS = [
  { key: "offer", label: "Offer letter", short: "Offer", description: "Generate, send and get the offer accepted." },
  { key: "personal", label: "Personal details", short: "Personal", description: "Date of birth, address and emergency contact." },
  { key: "documents", label: "Documents", short: "Documents", description: "Collect ID proofs and certificates." },
  { key: "bank", label: "Bank & payroll", short: "Payroll", description: "Bank account and salary setup." },
  { key: "setup", label: "First week", short: "First week", description: "Tools, policies, induction and training." },
  { key: "review", label: "Review & finish", short: "Finish", description: "Check everything and close onboarding." },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export function isStepKey(value: string | undefined): value is OnboardingStepKey {
  return ONBOARDING_STEPS.some((step) => step.key === value);
}

export function missingRequiredDocs(facts: OnboardingFacts) {
  return REQUIRED_DOC_TYPES.filter((type) => !facts.docTypes.includes(type));
}

export function stepDone(key: OnboardingStepKey, facts: OnboardingFacts): boolean {
  switch (key) {
    case "offer":
      return Boolean(facts.offer.acceptedAt) || facts.docTypes.includes("OFFER_LETTER");
    case "personal":
      return facts.personalDetails;
    case "documents":
      return missingRequiredDocs(facts).length === 0;
    case "bank":
      return facts.bankDetails && facts.hasPayroll;
    case "setup":
      return facts.hasLogin && SETUP_TASKS.every((task) => facts.checklist[task.key] === true);
    case "review":
      return false;
  }
}

/** Steps that count toward progress (everything except the final review). */
export const WORK_STEPS = ONBOARDING_STEPS.filter((step) => step.key !== "review");

export function onboardingProgress(facts: OnboardingFacts) {
  const done = WORK_STEPS.filter((step) => stepDone(step.key, facts)).length;
  const total = WORK_STEPS.length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

export function nextOpenStep(facts: OnboardingFacts): OnboardingStepKey {
  return WORK_STEPS.find((step) => !stepDone(step.key, facts))?.key ?? "review";
}

export function stepLabel(key: OnboardingStepKey) {
  return ONBOARDING_STEPS.find((step) => step.key === key)?.label ?? key;
}

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export const ONBOARDING_STATUS_TONE: Record<OnboardingStatus, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground border-transparent",
  IN_PROGRESS: "bg-warning/10 text-warning-foreground border-warning/20",
  COMPLETED: "bg-success/10 text-success border-success/20",
};

/** "Joins in 3 days", "Joins today", "Joined 5 days ago". */
export function joiningCountdown(joiningDate: string, todayIso: string) {
  const days = Math.round(
    (Date.parse(`${joiningDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000
  );
  if (days === 0) return "Joins today";
  if (days === 1) return "Joins tomorrow";
  if (days > 1) return `Joins in ${days} days`;
  if (days === -1) return "Joined yesterday";
  return `Joined ${Math.abs(days)} days ago`;
}
