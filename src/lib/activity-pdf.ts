import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatIsoDate, formatTimeInZone } from "@/lib/format";
import { shiftDayLines, shiftShortSummary } from "@/lib/shift-completion";
import type { ProductivityDay } from "@/lib/queries/productivity-report";
import type { ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { getWorkSettings } from "@/lib/work-settings";

const PAGE = { width: 595.28, height: 841.89 };
const ink = rgb(0.12, 0.14, 0.16);
const muted = rgb(0.4, 0.43, 0.47);
const rule = rgb(0.84, 0.86, 0.88);
const head = rgb(0.93, 0.95, 0.96);
const green = rgb(0.13, 0.55, 0.34);
const white = rgb(1, 1, 1);
const mint = rgb(0.86, 0.96, 0.9);
const shortInk = rgb(0.7, 0.18, 0.18);

export type ActivityPdfPerson = {
  id: string;
  fullName: string;
  employeeCode: string;
  days: ProductivityDay[];
};

export async function buildActivityPdf(input: {
  company: string;
  rangeLabel: string;
  people: ActivityPdfPerson[];
  events: ShiftActivityEvent[];
  truncated: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const zone = getWorkSettings().timeZone;
  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - 48;

  const newPage = (continued: string) => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - 40;
    page.drawText(pdfText(`${input.company}  |  ${continued}`), {
      x: 40,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 22;
  };

  const ensure = (need: number, continued: string) => {
    if (y < need) newPage(continued);
  };

  page.drawText(pdfText(input.company), { x: 40, y, size: 11, font: bold, color: ink });
  y -= 18;
  page.drawText("Activity log", { x: 40, y, size: 16, font: bold, color: ink });
  y -= 16;
  page.drawText(pdfText(input.rangeLabel), { x: 40, y, size: 10, font, color: muted });
  y -= 22;

  const drawShiftHeader = () => {
    ensure(22, "Shift days");
    page.drawText("Day", { x: 40, y, size: 8, font: bold, color: muted });
    page.drawText("Shift", { x: 168, y, size: 8, font: bold, color: muted });
    page.drawText("Worked", { x: 280, y, size: 8, font: bold, color: muted });
    page.drawText("Target", { x: 360, y, size: 8, font: bold, color: muted });
    page.drawText("Short", { x: 440, y, size: 8, font: bold, color: muted });
    y -= 12;
    page.drawLine({
      start: { x: 40, y: y + 8 },
      end: { x: PAGE.width - 40, y: y + 8 },
      thickness: 0.4,
      color: rule,
    });
  };

  const byPerson = new Map<string, ShiftActivityEvent[]>();
  for (const event of input.events) {
    const list = byPerson.get(event.employeeId) ?? [];
    list.push(event);
    byPerson.set(event.employeeId, list);
  }

  if (input.people.length === 0) {
    page.drawText("No employees in this range.", { x: 40, y, size: 11, font, color: muted });
  }

  for (const person of input.people) {
    const events = (byPerson.get(person.id) ?? []).slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const title = `${person.fullName} (${person.employeeCode})`;
    ensure(78, title);
    y -= 8;
    page.drawRectangle({
      x: 40,
      y: y - 26,
      width: PAGE.width - 80,
      height: 40,
      color: green,
    });
    page.drawText(pdfText(person.fullName), { x: 52, y: y - 2, size: 14, font: bold, color: white });
    page.drawText(pdfText(person.employeeCode), { x: 52, y: y - 18, size: 9, font, color: mint });
    y -= 46;

    const lines = shiftDayLines(person.days);
    const summary = shiftShortSummary(person.days);
    ensure(36, title);
    page.drawText(pdfText(summary.label), { x: 40, y, size: 10, font: bold, color: ink });
    y -= 16;
    drawShiftHeader();
    for (const line of lines) {
      ensure(18, title);
      const color = line.tone === "short" ? shortInk : line.tone === "complete" ? green : ink;
      page.drawText(pdfText(line.dateLabel), { x: 40, y, size: 8, font, color: ink });
      page.drawText(pdfText(line.result), { x: 168, y, size: 8, font: bold, color });
      page.drawText(pdfText(line.worked), { x: 280, y, size: 8, font, color: ink });
      page.drawText(pdfText(line.target), { x: 360, y, size: 8, font, color: ink });
      page.drawText(pdfText(line.short), { x: 440, y, size: 8, font: bold, color });
      y -= 13;
    }
    y -= 10;

    if (events.length === 0) {
      ensure(24, title);
      page.drawText("No activity in this range.", { x: 52, y, size: 10, font, color: muted });
      y -= 18;
      continue;
    }

    let lastDate = "";
    for (const event of events) {
      if (event.shiftDate !== lastDate) {
        ensure(40, title);
        lastDate = event.shiftDate;
        y -= 4;
        page.drawRectangle({ x: 40, y: y - 4, width: PAGE.width - 80, height: 18, color: head });
        page.drawText(pdfText(formatIsoDate(event.shiftDate)), { x: 52, y, size: 10, font: bold, color: ink });
        y -= 22;
      }
      ensure(22, title);
      const time = formatTimeInZone(event.at, zone);
      const detail =
        event.detail && event.detail !== "In progress" ? `  ${event.detail}` : event.detail ? "  in progress" : "";
      page.drawText(pdfText(clip(`${time}    ${event.label}${detail}`, 96)), {
        x: 52,
        y,
        size: 9,
        font,
        color: ink,
      });
      y -= 13;
      page.drawLine({
        start: { x: 52, y: y + 8 },
        end: { x: PAGE.width - 40, y: y + 8 },
        thickness: 0.3,
        color: rule,
      });
    }
    y -= 8;
  }

  if (input.truncated) {
    ensure(28, input.rangeLabel);
    page.drawText("Showing the latest 2,000 events. Narrow the range for the rest.", {
      x: 40,
      y,
      size: 9,
      font,
      color: muted,
    });
  }

  const pages = doc.getPages();
  pages.forEach((item, index) => stamp(item, font, index + 1, pages.length));
  return doc.save();
}

function stamp(page: PDFPage, font: PDFFont, index: number, total: number) {
  page.drawText(`Page ${index} of ${total}`, {
    x: PAGE.width - 110,
    y: 24,
    size: 8,
    font,
    color: muted,
  });
}

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function pdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ");
}
