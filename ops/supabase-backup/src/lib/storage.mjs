import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getObjectRecord, setObjectRecord } from "./state.mjs";
import { withBackoff } from "./retry.mjs";

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init = {}) =>
        fetch(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
        }),
    },
  });
}

/** Preserve exact bucket/object hierarchy on disk — never flatten or rename. */
export function localObjectPath(storageDir, bucket, objectPath) {
  const parts = String(objectPath).split("/").filter((p) => p.length > 0);
  // Reject path traversal while keeping original names (including spaces / case).
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new Error(`Unsafe object path segment in ${bucket}/${objectPath}`);
    }
  }
  if (!bucket || bucket.includes("..") || bucket.includes("/") || bucket.includes("\\")) {
    throw new Error(`Unsafe bucket name: ${bucket}`);
  }
  return path.join(storageDir, bucket, ...parts);
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function listAllBuckets(supabase, logger) {
  return withBackoff(
    async () => {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      return data || [];
    },
    { label: "listBuckets", logger, retries: 6 }
  );
}

async function listAllObjectsInBucket(supabase, bucket, logger) {
  const collected = [];
  const queue = [""];

  while (queue.length) {
    const prefix = queue.shift();
    let offset = 0;
    const limit = 100;
    for (;;) {
      const page = await withBackoff(
        async () => {
          const { data, error } = await supabase.storage.from(bucket).list(prefix, {
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
          if (error) throw error;
          return data || [];
        },
        { label: `list ${bucket}/${prefix || "(root)"}`, logger, retries: 6 }
      );

      if (!page.length) break;

      for (const item of page) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = item.id == null && (item.metadata == null || item.metadata === undefined);
        // Supabase marks folders with null id; files have an id.
        if (item.id == null && !item.metadata) {
          queue.push(fullPath);
          continue;
        }
        if (isFolder && Number(item.metadata?.size || 0) === 0 && !item.updated_at) {
          queue.push(fullPath);
          continue;
        }
        // Heuristic: folders often lack metadata.size; recurse when no id.
        if (item.id == null) {
          queue.push(fullPath);
          continue;
        }
        collected.push({
          bucket,
          path: fullPath,
          name: item.name,
          updatedAt: item.updated_at || item.created_at || null,
          size: Number(item.metadata?.size ?? item.metadata?.contentLength ?? 0) || null,
          etag: item.metadata?.eTag || item.metadata?.etag || null,
        });
      }

      if (page.length < limit) break;
      offset += limit;
    }
  }

  return collected;
}

function needsDownload(record, remote) {
  if (!record) return { needed: true, reason: "new" };
  if (record.status === "failed" || record.status === "pending" || record.status === "incomplete") {
    return { needed: true, reason: record.status };
  }
  if (record.status !== "verified") return { needed: true, reason: "unverified" };
  if (remote.updatedAt && record.updatedAt && remote.updatedAt !== record.updatedAt) {
    return { needed: true, reason: "modified" };
  }
  if (remote.size != null && record.size != null && Number(remote.size) !== Number(record.size)) {
    return { needed: true, reason: "size_changed" };
  }
  if (remote.etag && record.etag && remote.etag !== record.etag) {
    return { needed: true, reason: "etag_changed" };
  }
  if (record.localRelPath) {
    // Caller may still verify file exists on disk.
  }
  return { needed: false, reason: "up_to_date" };
}

async function downloadObjectVerified(supabase, config, remote, logger) {
  const finalPath = localObjectPath(config.storageDir, remote.bucket, remote.path);
  const partialPath = `${finalPath}.partial`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });

  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath);
    logger.warn("Cleared incomplete download partial", { path: `${remote.bucket}/${remote.path}` });
  }

  const blob = await withBackoff(
    async () => {
      const { data, error } = await supabase.storage.from(remote.bucket).download(remote.path);
      if (error) throw error;
      if (!data) throw new Error("Empty download response");
      return data;
    },
    { label: `download ${remote.bucket}/${remote.path}`, logger, retries: config.maxStorageRetries }
  );

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (remote.size != null && remote.size > 0 && buffer.length !== remote.size) {
    throw new Error(
      `Size mismatch for ${remote.bucket}/${remote.path}: expected ${remote.size}, got ${buffer.length}`
    );
  }

  fs.writeFileSync(partialPath, buffer);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const partialStat = fs.statSync(partialPath);
  if (partialStat.size !== buffer.length) {
    throw new Error("Partial write size mismatch");
  }

  // Never overwrite a verified file with an incomplete download — only rename after checks.
  fs.renameSync(partialPath, finalPath);
  const verifySha = await sha256File(finalPath);
  if (verifySha !== sha256) {
    fs.unlinkSync(finalPath);
    throw new Error("Post-rename SHA-256 mismatch — incomplete/corrupt download discarded");
  }

  return {
    localPath: finalPath,
    localRelPath: path.relative(config.backupRoot, finalPath),
    size: buffer.length,
    sha256,
  };
}

/**
 * Incremental Storage sync with exact path preservation and resume of pending/failed/incomplete.
 */
export async function syncStorage(config, state, { logger }) {
  const supabase = createServiceClient(config);
  const stats = {
    discovered: 0,
    downloaded: 0,
    modified: 0,
    pending: 0,
    failed: 0,
    recovered: 0,
    verifiedUnchanged: 0,
    verificationFailures: 0,
  };

  const buckets = await listAllBuckets(supabase, logger);
  logger.info("Discovered storage buckets", { count: buckets.length, names: buckets.map((b) => b.name) });

  const remotes = [];
  for (const bucket of buckets) {
    const objects = await listAllObjectsInBucket(supabase, bucket.name, logger);
    logger.info(`Listed objects in bucket ${bucket.name}`, { count: objects.length });
    remotes.push(...objects);
  }
  stats.discovered = remotes.length;

  // Mark known objects that still exist; keep history of missing remotes as pending for report.
  const seen = new Set();

  for (const remote of remotes) {
    seen.add(`${remote.bucket}/${remote.path}`);
    const existing = getObjectRecord(state, remote.bucket, remote.path);
    const decision = needsDownload(existing, remote);

    const localPath = localObjectPath(config.storageDir, remote.bucket, remote.path);
    const localExists = fs.existsSync(localPath);
    if (!decision.needed && existing?.status === "verified" && localExists) {
      stats.verifiedUnchanged += 1;
      continue;
    }
    if (!decision.needed && existing?.status === "verified" && !localExists) {
      decision.needed = true;
      decision.reason = "missing_local";
    }

    if (decision.reason === "modified" || decision.reason === "etag_changed" || decision.reason === "size_changed") {
      stats.modified += 1;
    }
    const recoveringPriorFailure =
      decision.reason === "failed" ||
      decision.reason === "incomplete" ||
      decision.reason === "pending" ||
      decision.reason === "missing_local";

    setObjectRecord(state, remote.bucket, remote.path, {
      status: "pending",
      updatedAt: remote.updatedAt,
      size: remote.size,
      etag: remote.etag,
      attempts: (existing?.attempts || 0) + 1,
      lastError: null,
    });

    try {
      const saved = await downloadObjectVerified(supabase, config, remote, logger);
      setObjectRecord(state, remote.bucket, remote.path, {
        status: "verified",
        size: saved.size,
        sha256: saved.sha256,
        etag: remote.etag,
        updatedAt: remote.updatedAt,
        localRelPath: saved.localRelPath,
        lastVerifiedAt: new Date().toISOString(),
        lastError: null,
      });
      stats.downloaded += 1;
      if (recoveringPriorFailure) stats.recovered += 1;
      logger.info("Stored object verified", {
        key: `${remote.bucket}/${remote.path}`,
        reason: decision.reason,
        sha256: saved.sha256,
        bytes: saved.size,
      });
    } catch (err) {
      const message = String(err?.message || err);
      setObjectRecord(state, remote.bucket, remote.path, {
        status: "failed",
        lastError: message,
      });
      stats.failed += 1;
      logger.error("Object download failed — left pending for next run", {
        key: `${remote.bucket}/${remote.path}`,
        error: message,
      });
      // Remove any leftover partial
      const partial = `${localPath}.partial`;
      if (fs.existsSync(partial)) fs.unlinkSync(partial);
    }
  }

  // Objects previously tracked but not seen this run stay as-is (not deleted from disk or state).
  for (const [key, row] of Object.entries(state.storage.objects)) {
    if (!seen.has(key) && (row.status === "pending" || row.status === "failed" || row.status === "incomplete")) {
      stats.pending += 1;
    } else if (row.status === "pending" || row.status === "failed" || row.status === "incomplete") {
      if (seen.has(key)) {
        /* failed above already counted */
      }
    }
  }

  // Recount live pending/failed after this pass
  let pending = 0;
  let failed = 0;
  let incomplete = 0;
  for (const row of Object.values(state.storage.objects)) {
    if (row.status === "pending") pending += 1;
    if (row.status === "failed") failed += 1;
    if (row.status === "incomplete") incomplete += 1;
  }
  stats.pending = pending + incomplete;
  stats.failed = failed;

  const ok = stats.failed === 0 && stats.pending === 0;
  return {
    status: ok ? "success" : stats.downloaded > 0 || stats.verifiedUnchanged > 0 ? "partial" : "failed",
    stats,
    bucketCount: buckets.length,
  };
}
