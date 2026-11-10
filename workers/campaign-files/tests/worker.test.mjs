// node --test tests/   (no network, no Supabase: pure functions plus a fake clamd)
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { mapColumns, validateSheet, isValidEmail, isValidPhone } from "../src/validate.mjs";
import { parseCsv, parseXlsx, checkXlsxSafety, FileRejected } from "../src/parse.mjs";
import { scanBuffer, interpretReply } from "../src/clamd.mjs";

const LIMITS = { maxRows: 1000, maxUnpackedBytes: 50 * 1024 * 1024 };

test("maps common header spellings to WorkTrack fields", () => {
  const { map, unmapped } = mapColumns(["First Name", "Last Name", "E-mail Address", "Direct Dial", "Company Name", "Job Title", "Country", "LinkedIn"]);
  assert.deepEqual(map, { first_name: 0, last_name: 1, email: 2, phone: 3, company: 4, job_title: 5, country: 6 });
  assert.deepEqual(unmapped, [7]);
});

test("email and phone checks", () => {
  assert.ok(isValidEmail("jane.doe@netapp.com"));
  assert.ok(!isValidEmail("jane.doe@netapp"));
  assert.ok(!isValidEmail("jane doe@netapp.com"));
  assert.ok(isValidPhone("+1 (408) 822-6000"));
  assert.ok(!isValidPhone("12345"));
});

test("validates rows, keeps reasons and marks later copies as duplicates", () => {
  const sheet = {
    headers: ["Name", "Email", "Phone", "Company", "Title"],
    rows: [
      ["Jane Doe", "jane@acme.com", "+1 408 555 0100", "Acme", "CIO"],
      ["", "bad-email", "", "Acme", "CTO"],
      ["John Roe", "", "", "Globex", "VP"],
      ["Jane Doe", "JANE@acme.com", "+1 408 555 0100", "Acme ", "CIO"],
      ["=HYPERLINK(\"x\")", "x@y.co", "", "Initech", ""],
    ],
  };
  const { records, summary } = validateSheet(sheet, ["full_name", "company"]);
  assert.equal(summary.total, 5);
  assert.equal(summary.valid, 2);
  assert.equal(summary.invalid, 2);
  assert.equal(summary.duplicates, 1);
  assert.deepEqual(records[1].invalid_reasons, ["Missing full name", "Invalid email"]);
  assert.deepEqual(records[2].invalid_reasons, ["No email or phone"]);
  assert.equal(records[3].status, "DUPLICATE");
  assert.equal(records[0].row_number, 2);
  // Text that looks like a formula is stored as plain text; exports escape it.
  assert.equal(records[4].full_name, "=HYPERLINK(\"x\")");
});

test("a required column missing from the file is reported once, not per row only", () => {
  const { summary } = validateSheet({ headers: ["Email", "Name"], rows: [["a@b.co", "A"]] }, ["full_name", "company"]);
  assert.deepEqual(summary.missingColumns, ["company"]);
});

test("CSV with a byte-order mark and extra columns parses", () => {
  const { headers, rows } = parseCsv(Buffer.from("﻿Name,Email\nA,a@b.co\nB,b@c.co,extra\n"), LIMITS);
  assert.deepEqual(headers, ["Name", "Email"]);
  assert.equal(rows.length, 2);
});

test("stray quotes inside unquoted CSV fields are kept as text, not a parse error", () => {
  const { rows } = parseCsv(Buffer.from('Name,Email\n=HYPERLINK("http://evil"),x@y.co\nO"Neil,o@y.co\n'), LIMITS);
  assert.equal(rows[0][0], '=HYPERLINK("http://evil")');
  assert.equal(rows[1][0], 'O"Neil');
});

test("a CSV over the row limit is refused, not cut short", () => {
  const body = ["Name,Email", ...Array.from({ length: 12 }, (_, i) => `P${i},p${i}@x.co`)].join("\n");
  assert.throws(() => parseCsv(Buffer.from(body), { ...LIMITS, maxRows: 10 }), FileRejected);
});

test("XLSX first sheet is read as stored values", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.addRow(["Name", "Email", "Company"]);
  sheet.addRow(["Jane", "jane@acme.com", "Acme"]);
  sheet.addRow([{ formula: "1+1", result: 2 }, "f@x.co", "Formula Co"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const { headers, rows } = await parseXlsx(buffer, LIMITS);
  assert.deepEqual(headers, ["Name", "Email", "Company"]);
  assert.deepEqual(rows[0], ["Jane", "jane@acme.com", "Acme"]);
  assert.equal(rows[1][0], "2");
});

/** Builds a minimal ZIP so the safety checks can be tested with hostile content. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const nameBuf = Buffer.from(name);
    const body = deflate ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("macro-enabled workbooks are refused", () => {
  const buffer = zip([
    { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") },
    { name: "xl/vbaProject.bin", data: Buffer.from("macro") },
  ]);
  assert.throws(() => checkXlsxSafety(buffer, LIMITS), /macros/);
});

test("compression bombs are refused before unpacking", () => {
  const buffer = zip([
    { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(60 * 1024 * 1024), deflate: true },
  ]);
  assert.throws(() => checkXlsxSafety(buffer, { ...LIMITS, maxUnpackedBytes: 2 * 1024 * 1024 * 1024 }), /compression bomb/);
  assert.throws(() => checkXlsxSafety(buffer, LIMITS), /unpacks to more/);
});

test("clamd replies are read strictly: only OK passes", () => {
  assert.deepEqual(interpretReply("stream: OK"), { clean: true, signature: null, raw: "stream: OK" });
  assert.equal(interpretReply("stream: Eicar-Test-Signature FOUND").signature, "Eicar-Test-Signature");
  assert.throws(() => interpretReply("INSTREAM size limit exceeded. ERROR"));
  assert.throws(() => interpretReply(""));
});

test("INSTREAM client against a fake clamd that flags the EICAR test string", async () => {
  const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const command = "zINSTREAM\0";
      if (buffer.length < command.length) return;
      let offset = command.length;
      const parts = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          const body = Buffer.concat(parts).toString("latin1");
          socket.end(body.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        parts.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const clean = await scanBuffer(Buffer.alloc(200_000, 65), { host: "127.0.0.1", port });
    assert.equal(clean.clean, true);
    const infected = await scanBuffer(Buffer.from(`Name,Email\n${EICAR},x@y.co\n`), { host: "127.0.0.1", port });
    assert.equal(infected.clean, false);
    assert.equal(infected.signature, "Eicar-Test-Signature");
  } finally {
    server.close();
  }
});
