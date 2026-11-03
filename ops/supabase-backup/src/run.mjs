#!/usr/bin/env node
/**
 * Hourly / startup Supabase backup runner (Mac mini + launchd).
 * - Fresh DB snapshot every successful cycle (prior snapshots kept)
 * - Incremental Storage sync with exact paths + SHA-256
 * - Missed-hour detection + automatic retry of pending/failed work
 * - Never marks incomplete work as successful
 */
import crypto from "node:crypto";
import { loadBackupEnv } from "./lib/env.mjs";
import { createLogger } from "./lib/log.mjs";
import { acquireLock } from "./lib/lock.mjs";
import { waitForInternet } from "./lib/retry.mjs";
import {
  appendRunHistory,
  detectMissedHours,
  loadState,
  saveState,
} from "./lib/state.mjs";
import { backupDatabase } from "./lib/db.mjs";
import { syncStorage } from "./lib/storage.mjs";
import { buildReport, writeReport } from "./lib/report.mjs";

function parseArgs(argv) {
  return {
    force: argv.includes("--force"),
    trigger: argv.includes("--startup")
      ? "startup_or_wake"
      : argv.includes("--manual")
        ? "manual"
        : "hourly",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadBackupEnv();
  const logger = createLogger(config.logDir);
  let lock;

  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
  const startedAt = new Date().toISOString();
  const notes = [];

  try {
    lock = acquireLock(config.stateDir);
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(0); // overlapping job — not a hard failure for launchd
  }

  const { filePath: statePath, state } = loadState(config.stateDir);
  state.lastAttemptAt = startedAt;

  let internetOk = false;
  let databaseResult = {
    status: "skipped",
    path: null,
    relativePath: null,
    bytes: 0,
    sha256: null,
    startedAt,
    finishedAt: startedAt,
    error: "not started",
  };
  let storageResult = {
    status: "skipped",
    bucketCount: 0,
    stats: {
      discovered: 0,
      downloaded: 0,
      modified: 0,
      pending: 0,
      failed: 0,
      recovered: 0,
      verifiedUnchanged: 0,
      verificationFailures: 0,
    },
  };

  try {
    logger.info("Backup run starting", {
      runId,
      trigger: args.trigger,
      envFile: config.envFile,
      backupRoot: config.backupRoot,
    });

    await waitForInternet({ logger });
    internetOk = true;

    const missed = detectMissedHours(state, new Date());
    state.missedHoursDetected = missed.missedHours;
    if (missed.missedHours > 0) {
      notes.push(
        `Detected ${missed.missedHours} missed hourly window(s) since ${missed.last}. Performing one complete catch-up of latest available data + pending Storage recovery.`
      );
      logger.warn("Missed backups detected — catch-up mode", missed);
    } else {
      notes.push("No missed hourly windows detected (or first run).");
    }

    // Always attempt a fresh DB snapshot this cycle. Failures stay pending for next run.
    databaseResult = await backupDatabase(config, { logger });
    if (databaseResult.status === "success") {
      state.database.lastSuccessPath = databaseResult.relativePath;
      state.database.pendingRetry = false;
      state.database.lastError = null;
      state.lastSuccessfulDatabaseAt = databaseResult.finishedAt;
      state.database.history = [
        {
          at: databaseResult.finishedAt,
          path: databaseResult.relativePath,
          sha256: databaseResult.sha256,
          bytes: databaseResult.bytes,
        },
        ...(state.database.history || []),
      ].slice(0, 200);
    } else {
      state.database.pendingRetry = true;
      state.database.lastError = databaseResult.error;
      notes.push("Database snapshot failed this run; will retry on next execution. Older successful snapshots were not modified.");
    }

    storageResult = await syncStorage(config, state, { logger });
    if (storageResult.status === "success") {
      state.lastSuccessfulStorageAt = new Date().toISOString();
    } else {
      notes.push(
        `Storage sync ${storageResult.status}: pending=${storageResult.stats.pending}, failed=${storageResult.stats.failed}. Will retry automatically.`
      );
    }

    const finishedAt = new Date().toISOString();
    const fullySuccessful =
      databaseResult.status === "success" && storageResult.status === "success";

    if (fullySuccessful) {
      state.lastSuccessfulRunAt = finishedAt;
      notes.push("Run marked successful: fresh DB snapshot verified and Storage inventory fully verified.");
    } else {
      notes.push(
        "Run NOT marked as lastSuccessfulRunAt — incomplete/failed work must recover on the next available run."
      );
    }

    const report = buildReport({
      runId,
      startedAt,
      finishedAt,
      trigger: args.trigger,
      missedHours: missed.missedHours,
      database: databaseResult,
      storage: storageResult,
      state,
      internetOk,
      notes,
    });

    appendRunHistory(state, {
      runId,
      startedAt,
      finishedAt,
      trigger: args.trigger,
      success: fullySuccessful,
      databaseStatus: databaseResult.status,
      storageStatus: storageResult.status,
      missedHours: missed.missedHours,
      reportId: runId,
    });

    saveState(statePath, state);
    const written = writeReport(config.reportDir, report);
    logger.info("Report written", written);

    console.log(
      JSON.stringify(
        {
          ok: fullySuccessful,
          runId,
          report: written.json,
          database: databaseResult.status,
          storage: storageResult.status,
          missedHours: missed.missedHours,
        },
        null,
        2
      )
    );

    process.exitCode = fullySuccessful ? 0 : 2;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const error = String(err?.message || err);
    logger.error("Backup run aborted", { error });
    notes.push(`Fatal: ${error}`);

    state.database.pendingRetry = state.database.pendingRetry || databaseResult.status !== "success";
    appendRunHistory(state, {
      runId,
      startedAt,
      finishedAt,
      trigger: args.trigger,
      success: false,
      databaseStatus: databaseResult.status,
      storageStatus: storageResult.status,
      error,
    });
    saveState(statePath, state);

    const report = buildReport({
      runId,
      startedAt,
      finishedAt,
      trigger: args.trigger,
      missedHours: state.missedHoursDetected || 0,
      database: databaseResult,
      storage: storageResult,
      state,
      internetOk,
      notes,
    });
    writeReport(config.reportDir, report);
    process.exitCode = 1;
  } finally {
    lock?.release();
    await logger.close();
  }
}

main();
