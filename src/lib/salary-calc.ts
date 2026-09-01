import { eachDateInclusive, isWeekendIso } from "@/lib/format";
import { monthStartEnd } from "@/lib/attendance-period";
import {
  PAY_CYCLE_DAYS,
  deductionLines,
  earningLines,
  employedCalendarDays,
  payslipPayDateIso,
  prorateAmount,
  roundMoney,
  type PayLine,
  type SalarySetup,
} from "@/lib/payroll";

export type AttendanceBreakdown = {
  officeDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  weekOffDays: number;
  lopDays: number;
  paidDays: number;
};

export type ComputedPayslip = {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  email: string;
  department: string;
  designation: string;
  location: string;
  joiningDate: string;
  month: string;
  payDate: string;
  payFrequency: string;
  packageGross: number;
  earnings: PayLine[];
  deductions: PayLine[];
  gross: number;
  totalDeductions: number;
  net: number;
  attendance: AttendanceBreakdown;
};

type LeaveCover = { start: string; end: string; paid: boolean };

function covers(date: string, leave: LeaveCover) {
  return date >= leave.start && date <= leave.end;
}

export function attendanceBreakdown(input: {
  period: string;
  joiningDate?: string | null;
  attendance: Array<{ attendance_date: string; status: string }>;
  leaves: LeaveCover[];
}): AttendanceBreakdown {
  const { start, end } = monthStartEnd(input.period);
  const join = input.joiningDate?.slice(0, 10) || start;
  const byDate = new Map(input.attendance.map((row) => [row.attendance_date.slice(0, 10), row.status]));
  const paidLeaves = input.leaves.filter((row) => row.paid);
  const unpaidLeaves = input.leaves.filter((row) => !row.paid);

  let officeDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let absentDays = 0;
  let weekOffDays = 0;
  let lopDays = 0;

  for (const date of eachDateInclusive(start, end)) {
    if (date < join) continue;
    const weekend = isWeekendIso(date);
    const unpaid = unpaidLeaves.some((row) => covers(date, row));
    const paid = paidLeaves.some((row) => covers(date, row));
    const status = byDate.get(date) || "";

    if (weekend) {
      weekOffDays += 1;
      continue;
    }
    if (unpaid) {
      unpaidLeaveDays += 1;
      lopDays += 1;
      continue;
    }
    if (paid || status === "ON_LEAVE") {
      paidLeaveDays += 1;
      continue;
    }
    if (status === "PRESENT") {
      officeDays += 1;
      continue;
    }
    if (status === "HALF_DAY") {
      officeDays += 0.5;
      lopDays += 0.5;
      absentDays += 0.5;
      continue;
    }
    if (status === "HOLIDAY" || status === "WEEK_OFF") {
      weekOffDays += 1;
      continue;
    }
    absentDays += 1;
    lopDays += 1;
  }

  const daysInMonth = eachDateInclusive(start, end).length;
  const employedDays = employedCalendarDays(input.period, join);
  const entitled = roundMoney((PAY_CYCLE_DAYS * employedDays) / Math.max(1, daysInMonth));
  const paidDays = Math.max(0, roundMoney(entitled - lopDays));

  return {
    officeDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays,
    weekOffDays,
    lopDays,
    paidDays,
  };
}

export function computePayslipAmounts(setup: SalarySetup, paidDays: number) {
  const earnings = earningLines(setup.base, setup).map((line) => ({
    ...line,
    amount: prorateAmount(line.amount, paidDays),
  }));
  const deductions = deductionLines(setup);
  const gross = roundMoney(earnings.reduce((sum, line) => sum + line.amount, 0));
  const totalDeductions = roundMoney(deductions.reduce((sum, line) => sum + line.amount, 0));
  const net = Math.max(0, roundMoney(gross - totalDeductions));
  return { earnings, deductions, gross, totalDeductions, net };
}
