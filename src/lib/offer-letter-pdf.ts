import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { companyProfile } from "@/lib/company";
import { indianRupeeInWords } from "@/lib/salary-words";

export type OfferLetterInput = {
  letterNumber: string;
  issueDate: string;
  fullName: string;
  address: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  joiningDate: string;
  annualCtc: number;
  probationMonths: number;
  noticeDays: number;
  reportingTo: string;
  workLocation: string;
  workingDays: string;
  shiftLabel: string;
  paidLeaveDays: number;
  validUntil: string;
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_TOP = 58;

/** Quore brand green (#00D8A5) and its light tint; everything else stays neutral. */
const brand = rgb(0, 216 / 255, 165 / 255);
const brandTint = rgb(0.92, 0.988, 0.972);
const ink = rgb(0.1, 0.1, 0.11);
const muted = rgb(0.45, 0.46, 0.48);
const rule = rgb(0.88, 0.89, 0.9);
const panel = rgb(0.975, 0.977, 0.98);
const white = rgb(1, 1, 1);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

function longDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function rupees(amount: number) {
  return `Rs. ${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Standard PDF fonts only cover WinAnsi; swap anything else for a safe character. */
function safe(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of safe(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  let value = safe(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "public", "logo.png"));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

function drawSpaced(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; size: number; font: PDFFont; color: RGB; spacing: number; alignRight?: boolean }
) {
  const chars = safe(text).split("");
  const width =
    chars.reduce((sum, char) => sum + options.font.widthOfTextAtSize(char, options.size), 0) +
    options.spacing * Math.max(0, chars.length - 1);
  let x = options.alignRight ? options.x - width : options.x;
  for (const char of chars) {
    page.drawText(char, { x, y: options.y, size: options.size, font: options.font, color: options.color });
    x += options.font.widthOfTextAtSize(char, options.size) + options.spacing;
  }
}

class Writer {
  page!: PDFPage;
  pages: PDFPage[] = [];
  y = 0;

  constructor(
    private pdf: PDFDocument,
    readonly fonts: Fonts,
    private logo: PDFImage | null,
    private candidate: string
  ) {
    this.addPage();
  }

  addPage() {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    const first = this.pages.length === 1;
    const company = companyProfile();
    const { regular, bold } = this.fonts;
    const headerHeight = first ? 92 : 56;
    const ruleY = PAGE.height - headerHeight;

    this.page.drawRectangle({ x: 0, y: PAGE.height - 4, width: PAGE.width, height: 4, color: brand });

    let textLeft = MARGIN;
    const logoHeight = first ? 40 : 22;
    const middle = ruleY + (headerHeight - 4) / 2 + 2;
    if (this.logo) {
      const scale = logoHeight / this.logo.height;
      const w = this.logo.width * scale;
      this.page.drawImage(this.logo, { x: MARGIN, y: middle - logoHeight / 2, width: w, height: logoHeight });
      textLeft = MARGIN + w + 12;
    }

    if (first) {
      this.page.drawText(safe(company.legalName), { x: textLeft, y: middle + 3, size: 14, font: bold, color: ink });
      this.page.drawText(fit(company.address, regular, 7.8, 270), {
        x: textLeft,
        y: middle - 11,
        size: 7.8,
        font: regular,
        color: muted,
      });
      drawSpaced(this.page, "OFFER LETTER", {
        x: PAGE.width - MARGIN,
        y: middle + 3,
        size: 11,
        font: bold,
        color: ink,
        spacing: 2,
        alignRight: true,
      });
      drawSpaced(this.page, "PRIVATE & CONFIDENTIAL", {
        x: PAGE.width - MARGIN,
        y: middle - 11,
        size: 6.6,
        font: regular,
        color: muted,
        spacing: 1.1,
        alignRight: true,
      });
    } else {
      this.page.drawText(safe(company.legalName), { x: textLeft, y: middle - 4, size: 10, font: bold, color: ink });
      const right = safe(`Offer Letter - ${this.candidate}`);
      this.page.drawText(right, {
        x: PAGE.width - MARGIN - regular.widthOfTextAtSize(right, 8),
        y: middle - 4,
        size: 8,
        font: regular,
        color: muted,
      });
    }

    this.page.drawLine({
      start: { x: MARGIN, y: ruleY },
      end: { x: PAGE.width - MARGIN, y: ruleY },
      thickness: 0.6,
      color: rule,
    });
    this.page.drawRectangle({ x: MARGIN, y: ruleY - 0.6, width: 60, height: 2, color: brand });
    this.y = ruleY - (first ? 28 : 24);
  }

  ensure(space: number) {
    if (this.y - space < FOOTER_TOP + 10) this.addPage();
  }

  gap(size: number) {
    this.y -= size;
  }

  paragraph(value: string, options: { size?: number; font?: PDFFont; color?: RGB; indent?: number; width?: number } = {}) {
    const size = options.size ?? 9.8;
    const font = options.font ?? this.fonts.regular;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.6;
    for (const line of wrap(value, font, size, (options.width ?? CONTENT_WIDTH) - indent)) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: options.color ?? ink });
      this.y -= lineHeight;
    }
  }

  sectionTitle(value: string) {
    this.ensure(40);
    this.gap(8);
    drawSpaced(this.page, value.toUpperCase(), {
      x: MARGIN,
      y: this.y - 10,
      size: 8.5,
      font: this.fonts.bold,
      color: ink,
      spacing: 1.1,
    });
    this.page.drawRectangle({ x: MARGIN, y: this.y - 18, width: 24, height: 2, color: brand });
    this.y -= 30;
  }

  /** Three highlight tiles in a row. */
  tiles(items: { label: string; value: string; note?: string; accent?: boolean }[]) {
    const height = 62;
    this.ensure(height + 8);
    const gapX = 10;
    const width = (CONTENT_WIDTH - gapX * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gapX);
      const top = this.y;
      this.page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        color: item.accent ? brandTint : white,
        borderColor: item.accent ? brand : rule,
        borderWidth: item.accent ? 0.9 : 0.6,
      });
      this.page.drawRectangle({ x, y: top - 2.5, width, height: 2.5, color: brand });
      drawSpaced(this.page, item.label.toUpperCase(), {
        x: x + 12,
        y: top - 17,
        size: 6.6,
        font: this.fonts.bold,
        color: muted,
        spacing: 0.8,
      });
      this.page.drawText(fit(item.value, this.fonts.bold, 14, width - 24), {
        x: x + 12,
        y: top - 37,
        size: 14,
        font: this.fonts.bold,
        color: ink,
      });
      if (item.note) {
        this.page.drawText(fit(item.note, this.fonts.regular, 7.5, width - 24), {
          x: x + 12,
          y: top - 52,
          size: 7.5,
          font: this.fonts.regular,
          color: muted,
        });
      }
    });
    this.y -= height + 10;
  }

  /** Two-column grid of label / value cells. */
  detailsGrid(cells: { label: string; value: string }[]) {
    const columns = 2;
    const cellWidth = CONTENT_WIDTH / columns;
    const size = 9.6;
    for (let start = 0; start < cells.length; start += columns) {
      const row = cells.slice(start, start + columns);
      const wrapped = row.map((cell) => wrap(cell.value, this.fonts.bold, size, cellWidth - 28));
      const height = 22 + Math.max(...wrapped.map((lines) => lines.length)) * size * 1.35;
      this.ensure(height);
      const top = this.y;
      if ((start / columns) % 2 === 0) {
        this.page.drawRectangle({ x: MARGIN, y: top - height, width: CONTENT_WIDTH, height, color: panel });
      }
      row.forEach((cell, index) => {
        const x = MARGIN + index * cellWidth + 14;
        drawSpaced(this.page, cell.label.toUpperCase(), {
          x,
          y: top - 13,
          size: 6.6,
          font: this.fonts.bold,
          color: muted,
          spacing: 0.7,
        });
        wrapped[index].forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x,
            y: top - 27 - lineIndex * size * 1.35,
            size,
            font: this.fonts.bold,
            color: ink,
          });
        });
      });
      this.y -= height;
    }
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 0.6,
      color: rule,
    });
  }

  terms(items: { title: string; body: string }[]) {
    const size = 9.4;
    const indent = 26;
    items.forEach((item, index) => {
      const lines = wrap(item.body, this.fonts.regular, size, CONTENT_WIDTH - indent);
      this.ensure(18 + Math.min(lines.length, 3) * size * 1.55);
      const top = this.y;
      this.page.drawCircle({ x: MARGIN + 8, y: top - 7, size: 8, color: brand });
      const number = String(index + 1);
      this.page.drawText(number, {
        x: MARGIN + 8 - this.fonts.bold.widthOfTextAtSize(number, 8) / 2,
        y: top - 9.8,
        size: 8,
        font: this.fonts.bold,
        color: ink,
      });
      this.page.drawText(safe(item.title), { x: MARGIN + indent, y: top - 10.5, size: 10, font: this.fonts.bold, color: ink });
      this.y -= 18;
      for (const line of lines) {
        this.ensure(size * 1.55);
        this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font: this.fonts.regular, color: ink });
        this.y -= size * 1.55;
      }
      this.y -= 6;
    });
  }

  signatures(company: string, candidate: string) {
    const height = 128;
    this.ensure(height + 10);
    const gapX = 14;
    const width = (CONTENT_WIDTH - gapX) / 2;
    const top = this.y;
    const blocks = [
      {
        heading: "FOR THE COMPANY",
        title: `For ${company}`,
        lines: ["Authorised Signatory", "Human Resources"],
        note: "",
      },
      {
        heading: "CANDIDATE ACCEPTANCE",
        title: candidate,
        lines: ["Signature", "Date"],
        note: "I have read and accept this offer on the terms stated above.",
      },
    ];
    blocks.forEach((block, index) => {
      const x = MARGIN + index * (width + gapX);
      this.page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        borderColor: rule,
        borderWidth: 0.8,
        color: white,
      });
      this.page.drawRectangle({ x, y: top - 2.5, width, height: 2.5, color: brand });
      drawSpaced(this.page, block.heading, {
        x: x + 14,
        y: top - 20,
        size: 6.8,
        font: this.fonts.bold,
        color: muted,
        spacing: 0.9,
      });
      this.page.drawText(fit(block.title, this.fonts.bold, 10, width - 28), {
        x: x + 14,
        y: top - 36,
        size: 10,
        font: this.fonts.bold,
        color: ink,
      });
      if (block.note) {
        wrap(block.note, this.fonts.italic, 7.6, width - 28).forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + 14,
            y: top - 50 - lineIndex * 10,
            size: 7.6,
            font: this.fonts.italic,
            color: muted,
          });
        });
      }
      const lineY = top - 96;
      this.page.drawLine({
        start: { x: x + 14, y: lineY },
        end: { x: x + width - 14, y: lineY },
        thickness: 0.7,
        color: muted,
      });
      this.page.drawText(safe(block.lines[0]), { x: x + 14, y: lineY - 13, size: 8.4, font: this.fonts.bold, color: ink });
      this.page.drawText(safe(block.lines[1]), {
        x: x + 14,
        y: lineY - 24,
        size: 8,
        font: this.fonts.regular,
        color: muted,
      });
    });
    this.y = top - height - 10;
  }

  finish(footerLeft: string) {
    const { regular, bold } = this.fonts;
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      // Drawn last at very low opacity so it stays visible behind shaded panels too.
      if (this.logo) {
        const height = 320;
        const width = (this.logo.width / this.logo.height) * height;
        page.drawImage(this.logo, {
          x: (PAGE.width - width) / 2,
          y: (PAGE.height - height) / 2 - 10,
          width,
          height,
          opacity: 0.045,
        });
      }
      page.drawLine({
        start: { x: MARGIN, y: FOOTER_TOP - 14 },
        end: { x: PAGE.width - MARGIN, y: FOOTER_TOP - 14 },
        thickness: 0.6,
        color: rule,
      });
      page.drawText(fit(footerLeft, regular, 7.2, CONTENT_WIDTH - 80), {
        x: MARGIN,
        y: FOOTER_TOP - 28,
        size: 7.2,
        font: regular,
        color: muted,
      });
      const label = `Page ${index + 1} of ${total}`;
      page.drawText(label, {
        x: PAGE.width - MARGIN - bold.widthOfTextAtSize(label, 7.2),
        y: FOOTER_TOP - 28,
        size: 7.2,
        font: bold,
        color: ink,
      });
      page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 4, color: brand });
    });
  }
}

export async function buildOfferLetterPdf(input: OfferLetterInput) {
  const pdf = await PDFDocument.create();
  const company = companyProfile();
  pdf.setTitle(`Offer Letter - ${input.fullName}`);
  pdf.setAuthor(company.legalName);
  pdf.setSubject(`Offer of employment - ${input.designation}`);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const logo = await loadLogo(pdf);
  const w = new Writer(pdf, fonts, logo, input.fullName);

  const nameParts = input.fullName.trim().split(/\s+/);
  const firstName =
    nameParts.find((part) => !/^(md|mohd|mr|mrs|ms|dr|shri|smt)\.?$/i.test(part)) ?? input.fullName;
  const monthly = input.annualCtc / 12;

  // Addressee on the left, reference box on the right.
  const metaTop = w.y;
  const boxWidth = 176;
  const boxX = PAGE.width - MARGIN - boxWidth;
  const metaRows: [string, string][] = [
    ["Ref. No.", input.letterNumber],
    ["Date", longDate(input.issueDate)],
    ["Valid until", longDate(input.validUntil)],
  ];
  const boxHeight = 16 + metaRows.length * 17;
  w.page.drawRectangle({ x: boxX, y: metaTop - boxHeight, width: boxWidth, height: boxHeight, color: panel });
  w.page.drawRectangle({ x: boxX, y: metaTop - boxHeight, width: 2.5, height: boxHeight, color: brand });
  metaRows.forEach(([label, value], index) => {
    const y = metaTop - 18 - index * 17;
    w.page.drawText(label, { x: boxX + 12, y, size: 7.8, font: fonts.regular, color: muted });
    const text = fit(value, fonts.bold, 8.4, boxWidth - 80);
    w.page.drawText(text, {
      x: boxX + boxWidth - 12 - fonts.bold.widthOfTextAtSize(text, 8.4),
      y,
      size: 8.4,
      font: fonts.bold,
      color: ink,
    });
  });

  const leftWidth = CONTENT_WIDTH - boxWidth - 24;
  drawSpaced(w.page, "ADDRESSED TO", {
    x: MARGIN,
    y: metaTop - 9,
    size: 6.8,
    font: fonts.bold,
    color: muted,
    spacing: 0.9,
  });
  let leftY = metaTop - 28;
  w.page.drawText(fit(input.fullName, fonts.bold, 14, leftWidth), {
    x: MARGIN,
    y: leftY,
    size: 14,
    font: fonts.bold,
    color: ink,
  });
  leftY -= 15;
  const addressLines = input.address ? wrap(input.address, fonts.regular, 8.6, leftWidth).slice(0, 3) : [];
  const contact = [input.email, input.phone].filter(Boolean).join("   |   ");
  for (const line of [...addressLines, ...(contact ? [contact] : [])]) {
    w.page.drawText(fit(line, fonts.regular, 8.6, leftWidth), {
      x: MARGIN,
      y: leftY,
      size: 8.6,
      font: fonts.regular,
      color: muted,
    });
    leftY -= 12;
  }
  w.y = Math.min(leftY, metaTop - boxHeight) - 22;

  // Subject strip.
  const subject = safe(`Subject: Offer of Employment for the position of ${input.designation}`);
  const subjectLines = wrap(subject, fonts.bold, 10, CONTENT_WIDTH - 28);
  const subjectHeight = 14 + subjectLines.length * 14;
  w.page.drawRectangle({ x: MARGIN, y: w.y - subjectHeight, width: CONTENT_WIDTH, height: subjectHeight, color: brandTint });
  w.page.drawRectangle({ x: MARGIN, y: w.y - subjectHeight, width: 3, height: subjectHeight, color: brand });
  subjectLines.forEach((line, index) => {
    w.page.drawText(line, { x: MARGIN + 14, y: w.y - 18 - index * 14, size: 10, font: fonts.bold, color: ink });
  });
  w.y -= subjectHeight + 18;

  w.paragraph(`Dear ${firstName},`, { font: fonts.bold, size: 10.2 });
  w.gap(4);
  w.paragraph(
    `Congratulations! Following our recent discussions, we are delighted to offer you the position of ${input.designation}${
      input.department ? ` in the ${input.department} team` : ""
    } at ${company.legalName}. We were impressed by your skills and attitude, and we are confident that you will be a valuable member of our growing team.`
  );
  w.gap(4);
  w.paragraph(
    `Your employment will commence on ${longDate(input.joiningDate)}. The key details of your offer are set out below, followed by the terms and conditions of your employment.`
  );

  w.sectionTitle("Your offer at a glance");
  w.tiles([
    {
      label: "Annual CTC",
      value: rupees(input.annualCtc),
      note: "Cost to company per year",
      accent: true,
    },
    { label: "Monthly (approx.)", value: rupees(monthly), note: "Before statutory deductions" },
    { label: "Date of joining", value: longDate(input.joiningDate), note: input.workLocation },
  ]);
  w.paragraph(`In words: ${indianRupeeInWords(Math.round(input.annualCtc))} per annum.`, {
    font: fonts.italic,
    size: 8.6,
    color: muted,
  });
  w.gap(8);

  const cells = [
    { label: "Designation", value: input.designation },
    { label: "Department", value: input.department || "-" },
    { label: "Reporting to", value: input.reportingTo || "Assigned on joining" },
    { label: "Work location", value: input.workLocation },
    { label: "Working days", value: input.workingDays },
    { label: "Shift timing", value: input.shiftLabel },
    {
      label: "Probation period",
      value: input.probationMonths > 0 ? `${input.probationMonths} month${input.probationMonths > 1 ? "s" : ""}` : "Not applicable",
    },
    { label: "Notice period", value: `${input.noticeDays} days` },
  ];
  w.detailsGrid(cells);

  w.sectionTitle("Terms and conditions");
  w.terms([
    {
      title: "Compensation",
      body: `Your annual cost to company (CTC) will be ${rupees(input.annualCtc)}. Salary is paid monthly by bank transfer, subject to applicable statutory deductions. A detailed salary breakup will be shared with your first payslip.`,
    },
    {
      title: "Probation and confirmation",
      body:
        input.probationMonths > 0
          ? `You will be on probation for ${input.probationMonths} month${input.probationMonths > 1 ? "s" : ""} from your date of joining. On satisfactory completion, your employment will be confirmed in writing.`
          : "This role does not carry a probation period. Your employment is confirmed from your date of joining.",
    },
    {
      title: "Working hours and attendance",
      body: `Your working hours will be ${input.shiftLabel}, ${input.workingDays}. Attendance, breaks and productive time are recorded on WorkTrack as per company policy.`,
    },
    {
      title: "Leave",
      body: `You will be entitled to ${input.paidLeaveDays} paid leave days per year, credited and availed as per the company leave policy, in addition to declared company holidays.`,
    },
    {
      title: "Notice period",
      body: `After confirmation, either party may end this employment by giving ${input.noticeDays} days' written notice, or salary in lieu of the notice period.`,
    },
    {
      title: "Confidentiality",
      body: "You will keep all company, client and customer information strictly confidential, during and after your employment, and will not use it for any purpose other than your work with us.",
    },
    {
      title: "Code of conduct",
      body: "You will follow the company's policies, code of conduct and data protection guidelines as communicated from time to time.",
    },
    {
      title: "Documents and verification",
      body: "Please bring originals and copies of your Aadhaar, PAN, education certificates, a recent passport-size photograph, bank details and, if applicable, your relieving letter. This offer is subject to satisfactory verification of these documents.",
    },
  ]);

  w.gap(4);
  w.paragraph(
    `This offer is valid until ${longDate(input.validUntil)}. To accept, please sign this letter and return a copy to the HR team on or before that date.`
  );
  w.gap(4);
  w.paragraph(`We are excited to have you on board and look forward to working with you at ${company.name}.`);
  w.gap(10);
  w.paragraph("Warm regards,", { size: 9.8 });
  w.paragraph(`Team HR, ${company.legalName}`, { font: fonts.bold, size: 9.8 });
  w.gap(14);

  w.signatures(company.legalName, input.fullName);

  w.finish(`${company.legalName}  |  ${company.address}`);
  return pdf.save();
}
