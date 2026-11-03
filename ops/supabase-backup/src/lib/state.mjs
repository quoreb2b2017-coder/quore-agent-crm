import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STATE_VERSION = 1;

function emptyState() {
  return {
    version: STATE_VERSION,
    lastSuccessfulRunAt: null,
    lastAttemptAt: null,
    lastSuccessfulDatabaseAt: null,
    lastSuccessfulStorageAt: null,
    missedHoursDetected: 0,
    database: {
      lastSuccessPath: null,
      pendingRetry: false,
      lastError: null,
      history: [],
    },
    storage: {
      objects: {},
    },
    runs: [],
  };
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

export function loadState(stateDir) {
  const filePath = path.join(stateDir, "backup-state.json");
  if (!fs.existsSync(filePath)) {
    const state = emptyState();
    atomicWriteJson(filePath, state);
    return { filePath, state };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const state = {
    ...emptyState(),
    ...raw,
    database: { ...emptyState().database, ...(raw.database || {}) },
    storage: {
      objects: { ...(raw.storage?.objects || {}) },
    },
    runs: Array.isArray(raw.runs) ? raw.runs : [],
  };
  return { filePath, state };
}

export function saveState(filePath, state) {
  atomicWriteJson(filePath, state);
}

export function appendRunHistory(state, run) {
  state.runs = [run, ...(state.runs || [])].slice(0, 500);
}

/** Hours that should have run since last success (capped). */
export function detectMissedHours(state, now = new Date()) {
  const last = state.lastSuccessfulRunAt || state.lastAttemptAt;
  if (!last) return { missedHours: 0, reason: "first_run" };
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return { missedHours: 0, reason: "invalid_timestamp" };
  const gapMs = now.getTime() - lastMs;
  const missed = Math.max(0, Math.floor(gapMs / (60 * 60 * 1000)) - 1);
  return { missedHours: missed, gapMs, last };
}

export function objectKey(bucket, objectPath) {
  return `${bucket}/${objectPath}`;
}

export function getObjectRecord(state, bucket, objectPath) {
  return state.storage.objects[objectKey(bucket, objectPath)] || null;
}

export function setObjectRecord(state, bucket, objectPath, patch) {
  const key = objectKey(bucket, objectPath);
  const prev = state.storage.objects[key] || {
    bucket,
    path: objectPath,
    status: "pending",
    size: null,
    etag: null,
    updatedAt: null,
    sha256: null,
    localRelPath: null,
    attempts: 0,
    lastError: null,
    lastVerifiedAt: null,
  };
  state.storage.objects[key] = { ...prev, ...patch, bucket, path: objectPath };
  return state.storage.objects[key];
}

export function storageSummary(state) {
  const counts = {
    verified: 0,
    pending: 0,
    failed: 0,
    incomplete: 0,
    total: 0,
  };
  for (const row of Object.values(state.storage.objects)) {
    counts.total += 1;
    const status = row.status || "pending";
    if (counts[status] != null) counts[status] += 1;
    else counts.pending += 1;
  }
  return counts;
}
