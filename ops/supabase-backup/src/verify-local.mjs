#!/usr/bin/env node
/**
 * Verifies local Storage mirror files against state SHA-256 / size.
 * Does not contact production. Safe to run anytime.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadBackupEnv } from "./lib/env.mjs";
import { loadState } from "./lib/state.mjs";

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const config = loadBackupEnv();
const { state } = loadState(config.stateDir);
const results = { ok: 0, missing: 0, mismatch: 0, skipped: 0, details: [] };

for (const row of Object.values(state.storage.objects)) {
  if (row.status !== "verified" || !row.localRelPath) {
    results.skipped += 1;
    continue;
  }
  const full = path.join(config.backupRoot, row.localRelPath);
  if (!fs.existsSync(full)) {
    results.missing += 1;
    results.details.push({ key: `${row.bucket}/${row.path}`, issue: "missing_file" });
    continue;
  }
  const size = fs.statSync(full).size;
  if (row.size != null && size !== row.size) {
    results.mismatch += 1;
    results.details.push({ key: `${row.bucket}/${row.path}`, issue: "size", expected: row.size, actual: size });
    continue;
  }
  if (row.sha256) {
    const digest = await sha256File(full);
    if (digest !== row.sha256) {
      results.mismatch += 1;
      results.details.push({ key: `${row.bucket}/${row.path}`, issue: "sha256" });
      continue;
    }
  }
  results.ok += 1;
}

console.log(JSON.stringify(results, null, 2));
process.exitCode = results.missing || results.mismatch ? 2 : 0;
