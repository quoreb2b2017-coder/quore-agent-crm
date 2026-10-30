import type { ComplianceControlStatus } from "@/types/supabase";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export const CONTROL_STATUS: Record<ComplianceControlStatus, { label: string; tone: Tone; color: string }> = {
  OPERATING_EVIDENCED: { label: "Operating", tone: "success", color: "#17b26a" },
  IMPLEMENTED_AWAITING_EVIDENCE: { label: "Awaiting evidence", tone: "brand", color: "#00d9a6" },
  IN_PROGRESS: { label: "In progress", tone: "info", color: "#7fb8e8" },
  REMEDIATION_REQUIRED: { label: "Remediation required", tone: "warning", color: "#f5a35c" },
  EXCEPTION_IDENTIFIED: { label: "Exception found", tone: "danger", color: "#f04438" },
  NOT_IMPLEMENTED: { label: "Not implemented", tone: "danger", color: "#f97066" },
  NOT_ASSESSED: { label: "Not assessed", tone: "neutral", color: "#98a2b3" },
  RISK_ACCEPTED: { label: "Risk accepted", tone: "neutral", color: "#7f56d9" },
  NOT_APPLICABLE: { label: "Not applicable", tone: "neutral", color: "#d0d5dd" },
};

export const CONTROL_STATUS_ORDER: ComplianceControlStatus[] = [
  "OPERATING_EVIDENCED",
  "IMPLEMENTED_AWAITING_EVIDENCE",
  "IN_PROGRESS",
  "REMEDIATION_REQUIRED",
  "EXCEPTION_IDENTIFIED",
  "NOT_IMPLEMENTED",
  "NOT_ASSESSED",
  "RISK_ACCEPTED",
  "NOT_APPLICABLE",
];

/** Statuses a person may set by hand. OPERATING needs the database gate to pass. */
export const MANUAL_CONTROL_STATUSES: ComplianceControlStatus[] = [
  "NOT_ASSESSED",
  "NOT_IMPLEMENTED",
  "IN_PROGRESS",
  "IMPLEMENTED_AWAITING_EVIDENCE",
  "OPERATING_EVIDENCED",
  "REMEDIATION_REQUIRED",
  "RISK_ACCEPTED",
  "NOT_APPLICABLE",
];

export const SEVERITY_TONE: Record<string, Tone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export const ACTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "danger" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  READY_FOR_VERIFICATION: { label: "Ready to verify", tone: "brand" },
  CLOSED: { label: "Closed", tone: "success" },
  RISK_ACCEPTED: { label: "Risk accepted", tone: "neutral" },
};

export const EVIDENCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: "Waiting for review", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const RISK_STATUS: Record<string, { label: string; tone: Tone }> = {
  IDENTIFIED: { label: "Identified", tone: "neutral" },
  ASSESSED: { label: "Assessed", tone: "info" },
  TREATMENT_IN_PROGRESS: { label: "Treatment in progress", tone: "warning" },
  TREATED: { label: "Treated", tone: "success" },
  ACCEPTED: { label: "Accepted", tone: "neutral" },
  CLOSED: { label: "Closed", tone: "success" },
};

export const EXCEPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Requested", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: value.length === 10 ? "UTC" : "Asia/Kolkata",
  });
}
