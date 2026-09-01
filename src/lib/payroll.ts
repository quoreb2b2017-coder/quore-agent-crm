import { calendarDateIsoIst, eachDateInclusive } from "@/lib/format";
import { monthStartEnd } from "@/lib/attendance-period";
import type { Json } from "@/types/supabase";

export const PAY_CYCLE_DAYS = 30;
export const PAYSLIP_GENERATE_DAY = 10;

export type PayLine = { name: string; amount: number };

export type SalaryComponents = {
  hra: number;
  allowance: number;
  conveyance: number;
  extraEarnings: PayLine[];
  incomeTax: number;
  providentFund: number;
  professionalTax: number;
  extraDeductions: PayLine[];
};

export type SalarySetup = {
  base: number;
  hra: number;
  allowance: number;
  conveyance: number;
  extraEarnings: PayLine[];
  incomeTax: number;
  providentFund: number;
  professionalTax: number;
  extraDeductions: PayLine[];
  packageGross: number;
  /** Same as packageGross — monthly CTC before attendance proration. */
  gross: number;
  fixedDeductions: number;
  payFrequency: string;
  effectiveFrom: string;
};

function moneyNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function moneyAmount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readLines(value: unknown): PayLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as { name?: unknown; amount?: unknown };
      const name = String(item.name || "").trim();
      if (!name) return null;
      return { name: name.slice(0, 80), amount: moneyAmount(item.amount) };
    })
    .filter((row): row is PayLine => Boolean(row));
}

export function readSalaryComponents(value: Json | null | undefined): SalaryComponents {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      hra: 0,
      allowance: 0,
      conveyance: 0,
      extraEarnings: [],
      incomeTax: 0,
      providentFund: 0,
      professionalTax: 0,
      extraDeductions: [],
    };
  }
  const record = value as Record<string, unknown>;
  return {
    hra: moneyAmount(record.hra),
    allowance: moneyAmount(record.allowance),
    conveyance: moneyAmount(record.conveyance),
    extraEarnings: readLines(record.extraEarnings),
    incomeTax: moneyAmount(record.incomeTax),
    providentFund: moneyAmount(record.providentFund),
    professionalTax: moneyAmount(record.professionalTax),
    extraDeductions: readLines(record.extraDeductions),
  };
}

export function salaryPackageGross(base: number, components: SalaryComponents) {
  const extra = components.extraEarnings.reduce((sum, line) => sum + line.amount, 0);
  return base + components.hra + components.allowance + components.conveyance + extra;
}

export function salaryFixedDeductions(components: SalaryComponents) {
  const extra = components.extraDeductions.reduce((sum, line) => sum + line.amount, 0);
  return components.incomeTax + components.providentFund + components.professionalTax + extra;
}

export function earningLines(base: number, components: SalaryComponents): PayLine[] {
  const lines: PayLine[] = [{ name: "Basic", amount: base }];
  if (components.hra) lines.push({ name: "House Rent Allowance", amount: components.hra });
  if (components.allowance) lines.push({ name: "Special Allowance", amount: components.allowance });
  if (components.conveyance) lines.push({ name: "Conveyance Allowance", amount: components.conveyance });
  lines.push(...components.extraEarnings);
  return lines.filter((line) => line.amount > 0 || line.name === "Basic");
}

export function deductionLines(components: SalaryComponents): PayLine[] {
  return [
    { name: "Income Tax", amount: components.incomeTax },
    { name: "Provident Fund", amount: components.providentFund },
    { name: "Professional tax", amount: components.professionalTax },
    ...components.extraDeductions.filter((line) => line.amount > 0),
  ];
}

export function formatPayslipMoney(amount: number) {
  return Number(amount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function currentPayrollMonth(date = new Date()): string {
  return calendarDateIsoIst(date).slice(0, 7);
}

export function shiftPayrollMonth(yyyyMm: string, delta: number): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function payrollMonthOptions(count = 18): string[] {
  const current = currentPayrollMonth();
  const options: string[] = [];
  for (let i = 0; i < count; i += 1) {
    options.push(shiftPayrollMonth(current, -i));
  }
  return options;
}

export function parseMonthParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  return /^\d{4}-\d{2}$/.test(raw) ? raw : currentPayrollMonth();
}

/** Payslip pay date is the 10th of the following month. */
export function payslipPayDateIso(period: string) {
  const next = shiftPayrollMonth(period, 1);
  return `${next}-10`;
}

export function formatPayDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Latest month whose pay date has been reached.
 * Pay date is the 10th of the following month, so on 10 Aug the July slip is released.
 * Before the 10th, the previous completed month stays the latest released slip.
 */
export function latestReleasedPayrollMonth(date = new Date()): string {
  const today = calendarDateIsoIst(date);
  const day = Number(today.slice(8, 10));
  const current = today.slice(0, 7);
  return shiftPayrollMonth(current, day >= PAYSLIP_GENERATE_DAY ? -1 : -2);
}

export function autoGeneratePayrollMonth(date = new Date()): string {
  return latestReleasedPayrollMonth(date);
}

export function isPayrollMonthReleased(period: string, date = new Date()) {
  return period <= latestReleasedPayrollMonth(date);
}

export function formatPayPeriodRange(period: string) {
  const { start, end } = monthStartEnd(period);
  return `${formatPayDate(start)} - ${formatPayDate(end)}`;
}

export function formatPayDays(value: number) {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function setupAsOf(
  records: Array<{
    employee_id: string;
    effective_from: string;
    base_salary: number;
    pay_frequency: string;
    components: Json;
  }>,
  employeeId: string,
  asOfDate: string,
  fallbackSalary?: number | null
): SalarySetup | null {
  const match = records.find(
    (record) => record.employee_id === employeeId && record.effective_from <= asOfDate
  );
  if (match) {
    const components = readSalaryComponents(match.components);
    const base = Number(match.base_salary);
    const packageGross = salaryPackageGross(base, components);
    return {
      base,
      ...components,
      packageGross,
      gross: packageGross,
      fixedDeductions: salaryFixedDeductions(components),
      payFrequency: match.pay_frequency,
      effectiveFrom: match.effective_from,
    };
  }
  if (fallbackSalary != null && moneyNumber(fallbackSalary) > 0) {
    const base = Number(fallbackSalary);
    const components = readSalaryComponents(null);
    return {
      base,
      ...components,
      packageGross: base,
      gross: base,
      fixedDeductions: 0,
      payFrequency: "MONTHLY",
      effectiveFrom: asOfDate,
    };
  }
  return null;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function prorateAmount(amount: number, paidDays: number) {
  return roundMoney((amount * paidDays) / PAY_CYCLE_DAYS);
}

export function employedCalendarDays(period: string, joiningDate?: string | null) {
  const { start, end } = monthStartEnd(period);
  const from = joiningDate && joiningDate > start ? joiningDate : start;
  if (from > end) return 0;
  return eachDateInclusive(from, end).length;
}
