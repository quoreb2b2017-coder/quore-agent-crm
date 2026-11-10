import type { Tone } from "@/lib/compliance/labels";
import type { CampaignFileStatus, CampaignMemberRole, CampaignStatus, DatabaseVersionStatus } from "@/types/supabase";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  AWAITING_DATABASE: { label: "Awaiting database", tone: "warning" },
  DATABASE_VALIDATION: { label: "Database validation", tone: "info" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  READY_FOR_DISTRIBUTION: { label: "Ready for distribution", tone: "brand" },
  IN_PRODUCTION: { label: "In production", tone: "success" },
  ON_HOLD: { label: "On hold", tone: "neutral" },
  QC_IN_PROGRESS: { label: "QC in progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  "DRAFT",
  "AWAITING_DATABASE",
  "DATABASE_VALIDATION",
  "AWAITING_APPROVAL",
  "READY_FOR_DISTRIBUTION",
  "IN_PRODUCTION",
  "QC_IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
];

/** Campaigns that are still being worked on (not archived or completed). */
export const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] = CAMPAIGN_STATUS_ORDER.filter(
  (s) => s !== "ARCHIVED" && s !== "COMPLETED"
);

export const VERSION_STATUS: Record<DatabaseVersionStatus, { label: string; tone: Tone }> = {
  PENDING_SCAN: { label: "Waiting for scan", tone: "info" },
  BLOCKED: { label: "Blocked: malware", tone: "danger" },
  VALIDATING: { label: "Validating", tone: "info" },
  VALIDATION_FAILED: { label: "Failed validation", tone: "danger" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  APPROVED: { label: "Approved, publishing", tone: "brand" },
  PUBLISHED: { label: "Published", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
};

export const FILE_STATUS: Record<CampaignFileStatus, { label: string; tone: Tone }> = {
  UPLOADING: { label: "Upload not finished", tone: "neutral" },
  QUARANTINED: { label: "In quarantine", tone: "info" },
  SCANNING: { label: "Scanning", tone: "info" },
  INFECTED: { label: "Blocked: malware", tone: "danger" },
  SCAN_FAILED: { label: "Scan failed", tone: "danger" },
  CLEAN: { label: "Scanned clean", tone: "info" },
  PUBLISHING: { label: "Publishing", tone: "brand" },
  PUBLISHED: { label: "Available", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const MEMBER_ROLE: Record<CampaignMemberRole, { label: string; hint: string }> = {
  MANAGER: { label: "Campaign manager", hint: "Runs the campaign; sees all of its files" },
  DATABASE: { label: "Database", hint: "Uploads and maintains the campaign database" },
  PRODUCTION: { label: "Production lead", hint: "Allocates and oversees calling (from phase 3)" },
  CALLER: { label: "Caller", hint: "Works allocated leads (from phase 3)" },
  QA: { label: "Quality", hint: "Reviews submissions (from phase 5)" },
};

export const REQUIRED_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "full_name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job title" },
  { key: "country", label: "Country" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

export const DATABASE_EXTENSIONS = ["csv", "xlsx"] as const;
export const DOCUMENT_EXTENSIONS = ["pdf", "docx", "doc", "txt", "pptx", "csv", "xlsx", "png", "jpg", "jpeg"] as const;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

/** Escapes spreadsheet formulas so an exported cell can never run (CSV injection). */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
