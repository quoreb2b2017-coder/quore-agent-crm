// Reads an uploaded CSV or XLSX database into a header row and data rows, with hard limits.
// Never evaluates formulas or macros: XLSX cells are read as stored values, macro-enabled
// workbooks are refused, and archives that would unpack past the limit are refused.
import { Readable } from "node:stream";
import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";

export class FileRejected extends Error {}

/**
 * Lists the entries of a ZIP (XLSX) from its central directory without unpacking anything.
 * @param {Buffer} buffer
 * @returns {{ name: string, compressed: number, uncompressed: number }[]}
 */
export function zipEntries(buffer) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FileRejected("This is not a valid .xlsx file.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new FileRejected("This .xlsx file is damaged.");
    }
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, compressed, uncompressed });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * @param {Buffer} buffer
 * @param {{ maxUnpackedBytes: number }} limits
 */
export function checkXlsxSafety(buffer, { maxUnpackedBytes }) {
  const entries = zipEntries(buffer);
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name))) {
    throw new FileRejected("Workbooks with macros are not accepted. Save it as a plain .xlsx or .csv.");
  }
  if (!entries.some((e) => e.name === "xl/workbook.xml")) {
    throw new FileRejected("This is not an Excel workbook.");
  }
  const total = entries.reduce((sum, e) => sum + e.uncompressed, 0);
  if (total > maxUnpackedBytes) {
    throw new FileRejected("This workbook unpacks to more than the allowed size.");
  }
  for (const e of entries) {
    if (e.compressed > 0 && e.uncompressed / e.compressed > 200 && e.uncompressed > 50 * 1024 * 1024) {
      throw new FileRejected("This workbook looks like a compression bomb and was refused.");
    }
  }
}

/** @param {unknown} value */
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // ExcelJS rich text, hyperlinks and formulas: take the stored text or cached result, never re-evaluate.
    const v = /** @type {Record<string, unknown>} */ (value);
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text ?? "").join("");
    if (typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result);
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}

/**
 * @param {Buffer} buffer
 * @param {{ maxRows: number }} limits
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(buffer, { maxRows }) {
  let records;
  try {
    records = parseCsvSync(buffer, {
      bom: true,
      relax_column_count: true,
      // Lead files exported from CRMs often carry stray quotes inside unquoted fields.
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
      to_line: maxRows + 2,
    });
  } catch (error) {
    throw new FileRejected(`The CSV could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (records.length === 0) throw new FileRejected("The file is empty.");
  if (records.length > maxRows + 1) throw new FileRejected(`The file has more than ${maxRows.toLocaleString("en-US")} rows. Split it into smaller files.`);
  const [headers, ...rows] = records;
  return { headers: headers.map((h) => String(h)), rows: rows.map((r) => r.map((c) => String(c ?? ""))) };
}

/**
 * Reads the first worksheet with the streaming reader, so a large file is not held twice.
 * @param {Buffer} buffer
 * @param {{ maxRows: number, maxUnpackedBytes: number }} limits
 */
export async function parseXlsx(buffer, limits) {
  checkXlsxSafety(buffer, limits);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  /** @type {string[][]} */
  const all = [];
  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      if (all.length > limits.maxRows + 1) {
        throw new FileRejected(`The sheet has more than ${limits.maxRows.toLocaleString("en-US")} rows. Split it into smaller files.`);
      }
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((v) => cellText(v).trim());
      if (cells.some((c) => c !== "")) all.push(cells);
    }
    break; // first worksheet only
  }
  if (all.length === 0) throw new FileRejected("The workbook's first sheet is empty.");
  const [headers, ...rows] = all;
  return { headers, rows };
}

/**
 * @param {Buffer} buffer
 * @param {string} extension
 * @param {{ maxRows: number, maxUnpackedBytes: number }} limits
 */
export async function parseDatabase(buffer, extension, limits) {
  if (extension === "csv") return parseCsv(buffer, limits);
  if (extension === "xlsx") return parseXlsx(buffer, limits);
  throw new FileRejected("Databases must be .csv or .xlsx.");
}
