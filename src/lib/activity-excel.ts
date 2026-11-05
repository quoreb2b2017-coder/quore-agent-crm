import type { Worksheet } from "exceljs";

export type ActivityWorkbookInput = {
  rangeLabel: string;
  summary: {
    name: string;
    employeeCode: string;
    status: string;
    logins: number;
    breaks: number;
    washrooms: number;
    meetings: number;
    complete: number;
    short: number;
    shortTime: string;
  }[];
  shifts: {
    name: string;
    employeeCode: string;
    date: string;
    result: string;
    worked: string;
    target: string;
    short: string;
    tone: "complete" | "short" | "progress" | "off";
  }[];
  events: {
    name: string;
    employeeCode: string;
    date: string;
    time: string;
    event: string;
    detail: string;
    /** Break ran over its allowance: the Detail cell is red. */
    over: boolean;
  }[];
};

const INK = "FF0B2420";
const WHITE = "FFFFFFFF";
const RED = "FFB42318";
const GREEN = "FF067647";
const AMBER = "FFB54708";
const YELLOW = "FFFEF08A";

/** Dark header, frozen first row, filter buttons and borders, so each sheet is ready to use. */
export function finishSheet(sheet: Worksheet) {
  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const line = { style: "thin" as const, color: { argb: "FFD3DCD8" } };
      cell.border = { top: line, left: line, bottom: line, right: line };
    });
  });
}

export async function buildActivityWorkbook(input: ActivityWorkbookInput) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.title = `Activity ${input.rangeLabel}`;

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "employeeCode", width: 14 },
    { header: "Current status", key: "status", width: 18 },
    { header: "Logins", key: "logins", width: 9 },
    { header: "Breaks", key: "breaks", width: 9 },
    { header: "Washroom", key: "washrooms", width: 11 },
    { header: "Meetings", key: "meetings", width: 10 },
    { header: "Days complete", key: "complete", width: 14 },
    { header: "Days short", key: "short", width: 11 },
    { header: "Total short", key: "shortTime", width: 12 },
  ];
  for (const row of input.summary) {
    const added = summary.addRow(row);
    if (row.short > 0) added.getCell("short").font = { bold: true, color: { argb: RED } };
    if (row.short > 0) added.getCell("shortTime").font = { bold: true, color: { argb: RED } };
  }
  finishSheet(summary);

  const shifts = workbook.addWorksheet("Shift completion");
  shifts.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "employeeCode", width: 14 },
    { header: "Day", key: "date", width: 20 },
    { header: "Shift", key: "result", width: 20 },
    { header: "Worked", key: "worked", width: 11 },
    { header: "Target", key: "target", width: 11 },
    { header: "Short", key: "short", width: 14 },
  ];
  const toneColor = { complete: GREEN, short: RED, progress: AMBER } as const;
  for (const row of input.shifts) {
    const added = shifts.addRow(row);
    if (row.tone !== "off") {
      const font = { bold: true, color: { argb: toneColor[row.tone] } };
      added.getCell("result").font = font;
      added.getCell("short").font = font;
    }
  }
  finishSheet(shifts);

  const events = workbook.addWorksheet("Activity log");
  events.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "employeeCode", width: 14 },
    { header: "Date", key: "date", width: 20 },
    { header: "Time", key: "time", width: 11 },
    { header: "Event", key: "event", width: 24 },
    { header: "Detail", key: "detail", width: 16 },
  ];
  input.events.forEach((row, index) => {
    const added = events.addRow(row);
    if (row.over) added.getCell("detail").font = { bold: true, color: { argb: RED } };
    // Last row of a person's date: this sheet stays one flat list so its filters keep working.
    const next = input.events[index + 1];
    if (!next || next.date !== row.date || next.employeeCode !== row.employeeCode) {
      added.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
      });
    }
  });
  finishSheet(events);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
