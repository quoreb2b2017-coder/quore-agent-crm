// Maps a database's columns to WorkTrack fields and checks every row.
// Pure functions: no I/O, so they are unit-tested in tests/validate.test.mjs.
import { createHash } from "node:crypto";

export const FIELDS = ["full_name", "first_name", "last_name", "email", "phone", "company", "job_title", "country"];

/** Header spellings seen in campaign databases, normalised (lower case, letters and digits only). */
const SYNONYMS = {
  full_name: ["fullname", "name", "contactname", "contact", "prospectname", "leadname"],
  first_name: ["firstname", "fname", "givenname", "first"],
  last_name: ["lastname", "lname", "surname", "familyname", "last"],
  email: ["email", "emailaddress", "emailid", "mail", "workemail", "businessemail", "contactemail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile", "mobilenumber", "contactnumber", "directdial", "directphone", "workphone", "phoneno", "cell"],
  company: ["company", "companyname", "organisation", "organization", "account", "accountname", "employer", "business"],
  job_title: ["jobtitle", "title", "designation", "position", "role", "jobrole"],
  country: ["country", "countryname", "location", "geo", "region"],
};

/** @param {string} header */
export function normaliseHeader(header) {
  return String(header ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string[]} headers
 * @returns {{ map: Record<string, number>, unmapped: number[] }}
 */
export function mapColumns(headers) {
  /** @type {Record<string, number>} */
  const map = {};
  headers.forEach((header, index) => {
    const key = normaliseHeader(header);
    for (const field of FIELDS) {
      if (map[field] === undefined && SYNONYMS[field].includes(key)) {
        map[field] = index;
        return;
      }
    }
  });
  const used = new Set(Object.values(map));
  const unmapped = headers.map((_, i) => i).filter((i) => !used.has(i) && String(headers[i] ?? "").trim() !== "");
  return { map, unmapped };
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** @param {string} value */
export function phoneDigits(value) {
  return String(value ?? "").replace(/(?!^\+)[^\d]/g, "").replace(/^\+/, "");
}

/** @param {string} value */
export function isValidEmail(value) {
  return value.length <= 254 && EMAIL.test(value);
}

/** @param {string} value */
export function isValidPhone(value) {
  const digits = phoneDigits(value);
  return digits.length >= 7 && digits.length <= 15;
}

/** @param {string} value */
function clip(value, max = 500) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Validates every row. The first copy of a person keeps its status; later copies are DUPLICATE.
 * @param {{ headers: string[], rows: string[][] }} sheet
 * @param {string[]} requiredFields
 */
export function validateSheet(sheet, requiredFields) {
  const { map, unmapped } = mapColumns(sheet.headers);
  const missingColumns = requiredFields.filter((field) => {
    if (field === "full_name") return map.full_name === undefined && (map.first_name === undefined || map.last_name === undefined);
    return map[field] === undefined;
  });
  if (map.email === undefined && map.phone === undefined) missingColumns.push("email or phone");

  const seen = new Set();
  /** @type {Record<string, number>} */
  const reasonCounts = {};
  const records = [];
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;

  sheet.rows.forEach((cells, index) => {
    /** @param {string} field */
    const get = (field) => (map[field] === undefined ? "" : clip(cells[map[field]] ?? ""));
    const first = get("first_name");
    const last = get("last_name");
    const full = get("full_name") || [first, last].filter(Boolean).join(" ");
    const email = get("email").toLowerCase();
    const phone = get("phone");
    const company = get("company");
    const record = {
      row_number: index + 2, // spreadsheet row, counting the header as row 1
      full_name: full || null,
      first_name: first || null,
      last_name: last || null,
      email: email || null,
      phone: phone || null,
      company: company || null,
      job_title: get("job_title") || null,
      country: get("country") || null,
      extra: Object.fromEntries(
        unmapped.slice(0, 60).map((i) => [clip(sheet.headers[i], 100), clip(cells[i] ?? "", 2000)]).filter(([, v]) => v !== "")
      ),
      status: "STAGED",
      invalid_reasons: /** @type {string[]} */ ([]),
      record_key: "",
    };

    const reasons = record.invalid_reasons;
    for (const field of requiredFields) {
      const value = field === "full_name" ? full : get(field);
      if (!value) reasons.push(`Missing ${field.replace("_", " ")}`);
    }
    if (!email && !phone) reasons.push("No email or phone");
    if (email && !isValidEmail(email)) reasons.push("Invalid email");
    if (phone && !isValidPhone(phone)) reasons.push("Invalid phone");

    const keySource = [email, phoneDigits(phone), company.toLowerCase().replace(/\s+/g, " ")].join("|");
    record.record_key = createHash("sha256").update(keySource).digest("hex");

    if (reasons.length > 0) {
      record.status = "INVALID";
      invalid += 1;
      for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    } else if (seen.has(record.record_key)) {
      record.status = "DUPLICATE";
      record.invalid_reasons = ["Duplicate of an earlier row"];
      duplicates += 1;
    } else {
      seen.add(record.record_key);
      valid += 1;
    }
    records.push(record);
  });

  return {
    records,
    summary: {
      columns: sheet.headers,
      columnMap: Object.fromEntries(Object.entries(map).map(([field, i]) => [field, sheet.headers[i]])),
      extraColumns: unmapped.map((i) => sheet.headers[i]),
      missingColumns,
      reasonCounts,
      total: sheet.rows.length,
      valid,
      invalid,
      duplicates,
    },
  };
}
