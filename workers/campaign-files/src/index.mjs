// WorkTrack Campaign Operations file worker.
//
//   QUARANTINED -> SCANNING -> (INFECTED | SCAN_FAILED | CLEAN)
//   CLEAN database file  -> parse + validate -> version AWAITING_APPROVAL or VALIDATION_FAILED
//   CLEAN document       -> PUBLISHING
//   PUBLISHING           -> copy to the approved bucket, re-check the hash -> PUBLISHED
//                           (+ co_publish_version for an approved database)
//
// Run exactly one instance. It uses the service-role key and must never be exposed to the internet.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { scanBuffer, ping } from "./clamd.mjs";
import { parseDatabase, FileRejected } from "./parse.mjs";
import { validateSheet } from "./validate.mjs";

const config = {
  url: requiredEnv("SUPABASE_URL"),
  serviceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  clamd: { host: process.env.CLAMD_HOST ?? "127.0.0.1", port: Number(process.env.CLAMD_PORT ?? 3310) },
  pollMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
  maxRows: Number(process.env.MAX_ROWS ?? 500_000),
  maxUnpackedBytes: Number(process.env.MAX_UNPACKED_BYTES ?? 1024 * 1024 * 1024),
  maxScanAttempts: 3,
  staleScanMinutes: 30,
};

const QUARANTINE = "co-quarantine";
const APPROVED = "co-approved";
const INSERT_BATCH = 1000;

const db = createClient(config.url, config.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "x-request-id": "campaign-file-worker" } },
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See workers/campaign-files/README.md.`);
    process.exit(1);
  }
  return value;
}

function log(event, details = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(bucket, path) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path} failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// ------------------------------------------------------------ notifications

async function employeesWithPermission(permission) {
  const perm = await must(db.from("permissions").select("id").eq("permission_key", permission).maybeSingle(), "permission");
  if (!perm) return [];
  const links = await must(db.from("role_permissions").select("role_id").eq("permission_id", perm.id), "role permissions");
  const roleIds = links.map((l) => l.role_id);
  if (roleIds.length === 0) return [];
  const holders = await must(db.from("employee_roles").select("employee_id").in("role_id", roleIds).eq("is_primary", true), "holders");
  const active = await must(
    db.from("employees").select("id").in("id", holders.map((h) => h.employee_id)).eq("employment_status", "ACTIVE"),
    "active holders"
  );
  return active.map((a) => a.id);
}

async function notify(employeeIds, { type, title, body, data = {} }) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return;
  const { error } = await db.from("notifications").insert(ids.map((employee_id) => ({ employee_id, type, title, body, data })));
  if (error) log("notify_failed", { error: error.message });
}

async function campaignLabel(campaignId) {
  const { data } = await db.from("co_campaigns").select("code, name").eq("id", campaignId).maybeSingle();
  return data ? `${data.code} ${data.name}` : "a campaign";
}

// ------------------------------------------------------------ claiming

/** Atomically moves one file from `from` to `to`; returns it, or null if another run took it. */
async function claim(from, to) {
  const { data: candidates } = await db
    .from("co_files")
    .select("id")
    .eq("status", from)
    .order("created_at", { ascending: true })
    .limit(1);
  const id = candidates?.[0]?.id;
  if (!id) return null;
  const { data } = await db.from("co_files").update({ status: to }).eq("id", id).eq("status", from).select("*").maybeSingle();
  return data ?? null;
}

async function recoverStaleScans() {
  const cutoff = new Date(Date.now() - config.staleScanMinutes * 60_000).toISOString();
  const { data } = await db.from("co_files").update({ status: "QUARANTINED" }).eq("status", "SCANNING").lt("updated_at", cutoff).select("id");
  if (data?.length) log("recovered_stale_scans", { count: data.length });
}

// ------------------------------------------------------------ stages

async function versionFor(fileId) {
  const { data } = await db.from("co_database_versions").select("*").eq("file_id", fileId).maybeSingle();
  return data ?? null;
}

async function scanStage(file) {
  const label = await campaignLabel(file.campaign_id);
  let buffer;
  try {
    buffer = await download(QUARANTINE, file.storage_path);
  } catch (error) {
    return scanFailed(file, `The upload could not be read: ${error.message}`, label);
  }
  if (buffer.length !== Number(file.size_bytes)) {
    return scanFailed(file, `Size on disk (${buffer.length} bytes) does not match the upload (${file.size_bytes} bytes).`, label, true);
  }
  const hash = sha256(buffer);

  let verdict;
  try {
    verdict = await scanBuffer(buffer, config.clamd);
  } catch (error) {
    return scanFailed(file, error.message, label);
  }

  if (!verdict.clean) {
    await must(
      db.from("co_files").update({ status: "INFECTED", sha256: hash, scan_result: verdict.signature, scanned_at: new Date().toISOString() }).eq("id", file.id),
      "mark infected"
    );
    const version = await versionFor(file.id);
    if (version) await must(db.from("co_database_versions").update({ status: "BLOCKED", summary: { blocked: verdict.signature } }).eq("id", version.id), "block version");
    const admins = await employeesWithPermission("co.campaign.manage");
    await notify([file.uploaded_by, ...admins], {
      type: "SECURITY_ALERT",
      title: `Malware blocked: ${file.original_name}`,
      body: `${label}. The scanner found ${verdict.signature}. The file stays in quarantine and nobody can open it.`,
      data: { href: `/admin/campaigns/${file.campaign_id}` },
    });
    log("infected", { file: file.id, signature: verdict.signature });
    return;
  }

  await must(
    db.from("co_files").update({ status: "CLEAN", sha256: hash, scan_result: "OK", scanned_at: new Date().toISOString() }).eq("id", file.id),
    "mark clean"
  );
  log("clean", { file: file.id, sha256: hash });

  const category = await must(db.from("co_file_categories").select("is_database").eq("key", file.category_key).single(), "category");
  if (category.is_database) {
    await validateStage({ ...file, sha256: hash }, buffer, label);
  } else {
    await must(db.from("co_files").update({ status: "PUBLISHING" }).eq("id", file.id).eq("status", "CLEAN"), "queue document");
  }
}

async function scanFailed(file, reason, label, final = false) {
  const attempts = (file.scan_attempts ?? 0) + 1;
  const giveUp = final || attempts >= config.maxScanAttempts;
  await must(
    db.from("co_files").update({ status: giveUp ? "SCAN_FAILED" : "QUARANTINED", scan_attempts: attempts, scan_result: reason.slice(0, 500) }).eq("id", file.id),
    "scan failed"
  );
  log("scan_failed", { file: file.id, attempts, giveUp, reason });
  if (giveUp) {
    const version = await versionFor(file.id);
    if (version && version.status === "PENDING_SCAN") {
      await db.from("co_database_versions").update({ status: "VALIDATION_FAILED", summary: { error: reason } }).eq("id", version.id);
    }
    await notify([file.uploaded_by], {
      type: "CAMPAIGN_FILE",
      title: `Upload could not be checked: ${file.original_name}`,
      body: `${label}. ${reason} Upload the file again; if it keeps failing, tell your administrator.`,
      data: { href: `/admin/campaigns/${file.campaign_id}` },
    });
  }
}

async function validateStage(file, buffer, label) {
  const version = await versionFor(file.id);
  if (!version) throw new Error(`database file ${file.id} has no version row`);
  await must(db.from("co_database_versions").update({ status: "VALIDATING" }).eq("id", version.id), "start validation");
  try {
    await loadAndValidate(file, buffer, label, version);
  } catch (error) {
    // The scan already passed, so the file is not retried; the version fails and the uploader is told.
    // Rows loaded before the error stay STAGED on a failed version and can never be published.
    log("validation_error", { file: file.id, version: version.id, error: error.message });
    await db
      .from("co_database_versions")
      .update({ status: "VALIDATION_FAILED", validated_at: new Date().toISOString(), summary: { error: "Validation stopped by an internal error. Upload the file again." } })
      .eq("id", version.id);
    await notify([file.uploaded_by], {
      type: "CAMPAIGN_FILE",
      title: `Database could not be validated: ${file.original_name}`,
      body: `${label}. Validation stopped by an internal error. Upload the file again; if it repeats, tell your administrator.`,
      data: { href: `/admin/campaigns/${file.campaign_id}?tab=database` },
    });
  }
}

async function loadAndValidate(file, buffer, label, version) {
  const campaign = await must(db.from("co_campaigns").select("required_fields").eq("id", file.campaign_id).single(), "campaign");

  let sheet;
  try {
    sheet = await parseDatabase(buffer, file.extension, { maxRows: config.maxRows, maxUnpackedBytes: config.maxUnpackedBytes });
  } catch (error) {
    const reason = error instanceof FileRejected ? error.message : `The file could not be read (${error.message}).`;
    await must(
      db.from("co_database_versions").update({ status: "VALIDATION_FAILED", validated_at: new Date().toISOString(), summary: { error: reason } }).eq("id", version.id),
      "validation failed"
    );
    await notify([file.uploaded_by], {
      type: "CAMPAIGN_FILE",
      title: `Database not accepted: ${file.original_name}`,
      body: `${label}. ${reason}`,
      data: { href: `/admin/campaigns/${file.campaign_id}` },
    });
    log("parse_rejected", { file: file.id, reason });
    return;
  }

  const { records, summary } = validateSheet(sheet, campaign.required_fields ?? []);

  // Re-runs after a crash start from a clean slate for this version.
  const { count: existing } = await db.from("co_lead_records").select("id", { count: "exact", head: true }).eq("version_id", version.id);
  if (existing) throw new Error(`version ${version.id} already has ${existing} rows; refusing to load twice`);

  for (let i = 0; i < records.length; i += INSERT_BATCH) {
    const batch = records.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, campaign_id: file.campaign_id, version_id: version.id }));
    await must(db.from("co_lead_records").insert(batch), `insert rows ${i + 1}-${i + batch.length}`);
  }

  const failed = summary.missingColumns.length > 0 || summary.valid === 0;
  await must(
    db
      .from("co_database_versions")
      .update({
        status: failed ? "VALIDATION_FAILED" : "AWAITING_APPROVAL",
        record_count: summary.total,
        valid_count: summary.valid,
        invalid_count: summary.invalid,
        duplicate_count: summary.duplicates,
        columns: summary.columns,
        column_map: summary.columnMap,
        summary,
        validated_at: new Date().toISOString(),
      })
      .eq("id", version.id),
    "finish validation"
  );
  log("validated", { file: file.id, version: version.id, ...summary, columns: undefined, failed });

  if (failed) {
    const why = summary.missingColumns.length
      ? `Missing column${summary.missingColumns.length > 1 ? "s" : ""}: ${summary.missingColumns.join(", ")}.`
      : "No row passed validation.";
    await notify([file.uploaded_by], {
      type: "CAMPAIGN_FILE",
      title: `Database failed validation: ${file.original_name}`,
      body: `${label}. ${why} Download the invalid-rows report from the campaign.`,
      data: { href: `/admin/campaigns/${file.campaign_id}?tab=database` },
    });
    return;
  }

  const approvers = (await employeesWithPermission("co.database.approve")).filter((id) => id !== file.uploaded_by);
  await notify(approvers, {
    type: "CAMPAIGN_APPROVAL",
    title: `Database awaiting approval: ${label}`,
    body: `Version ${version.version}: ${summary.valid.toLocaleString("en-US")} valid, ${summary.invalid.toLocaleString("en-US")} invalid, ${summary.duplicates.toLocaleString("en-US")} duplicate rows.`,
    data: { href: `/admin/campaigns/${file.campaign_id}?tab=database` },
  });
  await notify([file.uploaded_by], {
    type: "CAMPAIGN_FILE",
    title: `Database validated: ${file.original_name}`,
    body: `${label}. ${summary.valid.toLocaleString("en-US")} of ${summary.total.toLocaleString("en-US")} rows are valid. It now waits for approval by someone else.`,
    data: { href: `/admin/campaigns/${file.campaign_id}?tab=database` },
  });
}

async function publishStage(file) {
  const label = await campaignLabel(file.campaign_id);
  const quarantined = await download(QUARANTINE, file.storage_path);
  if (sha256(quarantined) !== file.sha256) {
    await must(db.from("co_files").update({ status: "SCAN_FAILED", scan_result: "Hash changed in quarantine; publication stopped." }).eq("id", file.id), "hash mismatch");
    const admins = await employeesWithPermission("co.campaign.manage");
    await notify(admins, {
      type: "SECURITY_ALERT",
      title: `File changed in quarantine: ${file.original_name}`,
      body: `${label}. Its fingerprint no longer matches the scanned copy, so it was not published.`,
      data: { href: `/admin/campaigns/${file.campaign_id}` },
    });
    log("hash_mismatch", { file: file.id });
    return;
  }

  const upload = await db.storage.from(APPROVED).upload(file.storage_path, quarantined, {
    contentType: file.mime_type || "application/octet-stream",
    upsert: false,
  });
  if (upload.error && !/exists|duplicate/i.test(upload.error.message)) {
    throw new Error(`copy to approved failed: ${upload.error.message}`);
  }
  const approvedCopy = await download(APPROVED, file.storage_path);
  if (sha256(approvedCopy) !== file.sha256) throw new Error(`approved copy of ${file.id} does not match its hash`);

  await must(
    db.from("co_files").update({ status: "PUBLISHED", bucket: APPROVED, published_at: new Date().toISOString() }).eq("id", file.id).eq("status", "PUBLISHING"),
    "mark published"
  );
  await db.storage.from(QUARANTINE).remove([file.storage_path]);

  const version = await versionFor(file.id);
  if (version && version.status === "APPROVED") {
    const count = await must(db.rpc("co_publish_version", { p_version_id: version.id }), "publish version");
    await notify([file.uploaded_by, version.decided_by], {
      type: "CAMPAIGN_FILE",
      title: `Database published: ${label}`,
      body: `Version ${version.version} is live. ${Number(count).toLocaleString("en-US")} records are available for distribution.`,
      data: { href: `/admin/campaigns/${file.campaign_id}?tab=database` },
    });
  } else {
    await notify([file.uploaded_by], {
      type: "CAMPAIGN_FILE",
      title: `Document available: ${file.title}`,
      body: `${label}. It passed the malware scan and campaign members can now open it.`,
      data: { href: `/admin/campaigns/${file.campaign_id}?tab=documents` },
    });
  }
  log("published", { file: file.id, version: version?.id ?? null });
}

// ------------------------------------------------------------ loop

async function tick() {
  let worked = false;
  for (;;) {
    const file = await claim("QUARANTINED", "SCANNING");
    if (!file) break;
    worked = true;
    try {
      await scanStage(file);
    } catch (error) {
      log("scan_stage_error", { file: file.id, error: error.message });
      await scanFailed(file, `Internal error: ${error.message}`, await campaignLabel(file.campaign_id));
    }
  }
  for (;;) {
    const { data } = await db.from("co_files").select("*").eq("status", "PUBLISHING").order("updated_at").limit(1);
    const file = data?.[0];
    if (!file) break;
    worked = true;
    try {
      await publishStage(file);
    } catch (error) {
      log("publish_stage_error", { file: file.id, error: error.message });
      break; // try again next tick
    }
  }
  return worked;
}

async function main() {
  const once = process.argv.includes("--once");
  if (!(await ping(config.clamd))) {
    log("clamd_unreachable", config.clamd);
    if (once) process.exit(2);
  }
  log("started", { once, pollMs: config.pollMs });
  await recoverStaleScans();
  if (once) {
    await tick();
    return;
  }
  let lastRecovery = Date.now();
  for (;;) {
    try {
      const worked = await tick();
      if (Date.now() - lastRecovery > 5 * 60_000) {
        await recoverStaleScans();
        lastRecovery = Date.now();
      }
      if (!worked) await new Promise((r) => setTimeout(r, config.pollMs));
    } catch (error) {
      log("tick_error", { error: error.message });
      await new Promise((r) => setTimeout(r, config.pollMs));
    }
  }
}

main().catch((error) => {
  log("fatal", { error: error.message });
  process.exit(1);
});
