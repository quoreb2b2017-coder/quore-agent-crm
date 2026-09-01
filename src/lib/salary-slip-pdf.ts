import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatMonthLabel } from "@/lib/format";
import { companyProfile } from "@/lib/company";
import { formatPayDate, formatPayDays } from "@/lib/payroll";
import { indianRupeeInWords } from "@/lib/salary-words";
import type { ComputedPayslip } from "@/lib/salary-calc";

export type SalarySlipPdfInput = {
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
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  paidDays: number;
  lopDays: number;
  officeDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
};

const PAGE = { width: 595.28, height: 841.89 };
const mint = rgb(0.918, 0.965, 0.933);
const green = rgb(0.235, 0.702, 0.443);
const ink = rgb(0.12, 0.14, 0.16);
const muted = rgb(0.4, 0.43, 0.47);
const rule = rgb(0.84, 0.86, 0.88);
const head = rgb(0.93, 0.95, 0.96);

export function computedToPdfInput(slip: ComputedPayslip): SalarySlipPdfInput {
  return {
    fullName: slip.fullName,
    employeeCode: slip.employeeCode,
    email: slip.email,
    department: slip.department,
    designation: slip.designation,
    location: slip.location,
    joiningDate: slip.joiningDate,
    month: slip.month,
    payDate: slip.payDate,
    payFrequency: slip.payFrequency,
    earnings: slip.earnings,
    deductions: slip.deductions,
    gross: slip.gross,
    totalDeductions: slip.totalDeductions,
    net: slip.net,
    paidDays: slip.attendance.paidDays,
    lopDays: slip.attendance.lopDays,
    officeDays: slip.attendance.officeDays,
    paidLeaveDays: slip.attendance.paidLeaveDays,
    unpaidLeaveDays: slip.attendance.unpaidLeaveDays,
  };
}

function money(amount: number) {
  return `Rs. ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function rightText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = ink
) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function clip(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) return lines;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "public", "logo.png"));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

async function addPayslipPage(
  pdf: PDFDocument,
  input: SalarySlipPdfInput,
  fonts: { regular: PDFFont; bold: PDFFont },
  logo: PDFImage | null
) {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const company = companyProfile();
  const { width, height } = page.getSize();
  const left = 36;
  const right = width - 36;
  const inner = right - left;

  let headerLeft = left;
  if (logo) {
    const maxH = 46;
    const scale = Math.min(maxH / logo.height, 52 / logo.width);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: left, y: height - 28 - h, width: w, height: h });
    headerLeft = left + w + 12;
  }

  page.drawText(clip(company.legalName, fonts.bold, 13, right - headerLeft - 160), {
    x: headerLeft,
    y: height - 42,
    size: 13,
    font: fonts.bold,
    color: ink,
  });
  const addressLines = wrap(company.address, fonts.regular, 8, right - headerLeft - 160, 3);
  addressLines.forEach((line, index) => {
    page.drawText(line, {
      x: headerLeft,
      y: height - 56 - index * 11,
      size: 8,
      font: fonts.regular,
      color: muted,
    });
  });

  rightText(page, "Payslip For the Month", right, height - 40, 9, fonts.regular, muted);
  rightText(page, formatMonthLabel(input.month), right, height - 56, 12, fonts.bold, ink);

  const summaryTop = height - 108;
  page.drawText("EMPLOYEE SUMMARY", {
    x: left,
    y: summaryTop,
    size: 8,
    font: fonts.bold,
    color: muted,
  });

  const summary = [
    ["Employee Name", input.fullName],
    ["Employee ID", input.employeeCode],
    ["Pay Period", formatMonthLabel(input.month)],
    ["Pay Date", formatPayDate(input.payDate)],
  ];
  summary.forEach((row, index) => {
    const y = summaryTop - 22 - index * 16;
    page.drawText(row[0], { x: left, y, size: 9, font: fonts.regular, color: muted });
    page.drawText(":", { x: left + 92, y, size: 9, font: fonts.regular, color: muted });
    page.drawText(clip(row[1], fonts.bold, 9, 220), {
      x: left + 102,
      y,
      size: 9,
      font: fonts.bold,
      color: ink,
    });
  });

  const cardX = right - 176;
  const cardW = 176;
  const cardTop = summaryTop + 8;
  const cardH = 96;
  page.drawRectangle({
    x: cardX,
    y: cardTop - cardH,
    width: cardW,
    height: cardH,
    borderColor: rule,
    borderWidth: 0.8,
  });
  page.drawRectangle({
    x: cardX,
    y: cardTop - 48,
    width: cardW,
    height: 48,
    color: mint,
  });
  page.drawRectangle({
    x: cardX,
    y: cardTop - 48,
    width: 4,
    height: 48,
    color: green,
  });
  page.drawText(money(input.net), {
    x: cardX + 12,
    y: cardTop - 22,
    size: 12,
    font: fonts.bold,
    color: ink,
  });
  page.drawText("Total Net Pay", {
    x: cardX + 12,
    y: cardTop - 36,
    size: 8,
    font: fonts.regular,
    color: muted,
  });
  page.drawLine({
    start: { x: cardX + 8, y: cardTop - 48 },
    end: { x: cardX + cardW - 8, y: cardTop - 48 },
    thickness: 0.6,
    color: rule,
    dashArray: [2.5, 2],
  });
  page.drawText("Paid Days", { x: cardX + 12, y: cardTop - 64, size: 8, font: fonts.regular, color: muted });
  page.drawText(":", { x: cardX + 68, y: cardTop - 64, size: 8, font: fonts.regular, color: muted });
  page.drawText(formatPayDays(input.paidDays), {
    x: cardX + 76,
    y: cardTop - 64,
    size: 8,
    font: fonts.bold,
    color: ink,
  });
  page.drawText("LOP Days", { x: cardX + 12, y: cardTop - 80, size: 8, font: fonts.regular, color: muted });
  page.drawText(":", { x: cardX + 68, y: cardTop - 80, size: 8, font: fonts.regular, color: muted });
  page.drawText(formatPayDays(input.lopDays), {
    x: cardX + 76,
    y: cardTop - 80,
    size: 8,
    font: fonts.bold,
    color: ink,
  });

  const tableTop = cardTop - cardH - 18;
  const colWidth = inner / 2;
  const earnX = left;
  const dedX = left + colWidth;
  const rowH = 20;
  const earnings = input.earnings.length ? input.earnings : [{ name: "Basic", amount: 0 }];
  const deductions = input.deductions;
  const rowCount = Math.max(earnings.length, deductions.length, 3);
  const tableH = 22 + rowCount * rowH + rowH;

  page.drawRectangle({
    x: left,
    y: tableTop - tableH,
    width: inner,
    height: tableH,
    borderColor: rule,
    borderWidth: 0.8,
  });
  page.drawLine({
    start: { x: dedX, y: tableTop },
    end: { x: dedX, y: tableTop - tableH },
    thickness: 0.6,
    color: rule,
  });

  function sectionHead(x: number, label: string) {
    page.drawText(label, { x: x + 10, y: tableTop - 14, size: 8, font: fonts.bold, color: muted });
    rightText(page, "AMOUNT", x + colWidth - 10, tableTop - 14, 8, fonts.bold, muted);
  }

  sectionHead(earnX, "EARNINGS");
  sectionHead(dedX, "DEDUCTIONS");
  page.drawLine({
    start: { x: left, y: tableTop - 22 },
    end: { x: right, y: tableTop - 22 },
    thickness: 0.5,
    color: rule,
  });

  for (let i = 0; i < rowCount; i += 1) {
    const y = tableTop - 22 - (i + 1) * rowH;
    if (i > 0) {
      page.drawLine({
        start: { x: left + 8, y: y + rowH },
        end: { x: earnX + colWidth - 8, y: y + rowH },
        thickness: 0.4,
        color: rule,
        dashArray: [1.2, 1.6],
      });
      page.drawLine({
        start: { x: dedX + 8, y: y + rowH },
        end: { x: right - 8, y: y + rowH },
        thickness: 0.4,
        color: rule,
        dashArray: [1.2, 1.6],
      });
    }
    const earn = earnings[i];
    if (earn) {
      page.drawText(clip(earn.name, fonts.regular, 9, colWidth - 90), {
        x: earnX + 10,
        y: y + 6,
        size: 9,
        font: fonts.regular,
        color: ink,
      });
      rightText(page, money(earn.amount), earnX + colWidth - 10, y + 6, 9, fonts.regular);
    }
    const ded = deductions[i];
    if (ded) {
      page.drawText(clip(ded.name, fonts.regular, 9, colWidth - 90), {
        x: dedX + 10,
        y: y + 6,
        size: 9,
        font: fonts.regular,
        color: ink,
      });
      rightText(page, money(ded.amount), dedX + colWidth - 10, y + 6, 9, fonts.regular);
    }
  }

  const totalY = tableTop - 22 - (rowCount + 1) * rowH;
  page.drawRectangle({ x: left, y: totalY, width: inner, height: rowH, color: head });
  page.drawLine({
    start: { x: dedX, y: totalY },
    end: { x: dedX, y: totalY + rowH },
    thickness: 0.6,
    color: rule,
  });
  page.drawText("Gross Earnings", { x: earnX + 10, y: totalY + 6, size: 9, font: fonts.bold, color: ink });
  rightText(page, money(input.gross), earnX + colWidth - 10, totalY + 6, 9, fonts.bold);
  page.drawText("Total Deductions", { x: dedX + 10, y: totalY + 6, size: 9, font: fonts.bold, color: ink });
  rightText(page, money(input.totalDeductions), right - 10, totalY + 6, 9, fonts.bold);

  const netY = totalY - 38;
  page.drawRectangle({
    x: left,
    y: netY - 8,
    width: inner,
    height: 36,
    borderColor: rule,
    borderWidth: 0.8,
  });
  page.drawText("TOTAL NET PAYABLE", {
    x: left + 12,
    y: netY + 10,
    size: 9,
    font: fonts.bold,
    color: ink,
  });
  page.drawText("Gross Earnings - Total Deductions", {
    x: left + 12,
    y: netY - 2,
    size: 7,
    font: fonts.regular,
    color: muted,
  });
  const netLabel = money(input.net);
  const netW = fonts.bold.widthOfTextAtSize(netLabel, 11) + 16;
  page.drawRectangle({
    x: right - 10 - netW,
    y: netY - 2,
    width: netW,
    height: 20,
    color: mint,
  });
  rightText(page, netLabel, right - 18, netY + 4, 11, fonts.bold, ink);

  page.drawText(`Amount In Words : ${indianRupeeInWords(input.net)}`, {
    x: left,
    y: netY - 28,
    size: 8,
    font: fonts.regular,
    color: ink,
  });

  page.drawLine({
    start: { x: left, y: 46 },
    end: { x: right, y: 46 },
    thickness: 0.6,
    color: rule,
  });
  page.drawText("This is a system generated payslip and does not require signature.", {
    x: left,
    y: 32,
    size: 7.5,
    font: fonts.regular,
    color: muted,
  });
}

export async function buildSalarySlipPdf(input: SalarySlipPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  await addPayslipPage(pdf, input, { regular, bold }, logo);
  return pdf.save();
}

export async function buildSalaryTeamReportPdf(inputs: SalarySlipPdfInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  if (inputs.length === 0) {
    pdf.addPage([PAGE.width, PAGE.height]);
  } else {
    for (const input of inputs) {
      await addPayslipPage(pdf, input, { regular, bold }, logo);
    }
  }
  return pdf.save();
}
