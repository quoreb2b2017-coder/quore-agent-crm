#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadBackupEnv } from "./lib/env.mjs";
import { detectMissedHours, loadState, storageSummary } from "./lib/state.mjs";

const config = loadBackupEnv();
const { state } = loadState(config.stateDir);
const missed = detectMissedHours(state);
const storage = storageSummary(state);
const latestReport = path.join(config.reportDir, "latest.json");

console.log(
  JSON.stringify(
    {
      backupRoot: config.backupRoot,
      lastSuccessfulRunAt: state.lastSuccessfulRunAt,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessfulDatabaseAt: state.lastSuccessfulDatabaseAt,
      lastSuccessfulStorageAt: state.lastSuccessfulStorageAt,
      databasePendingRetry: state.database.pendingRetry,
      missedHoursIfRunNow: missed.missedHours,
      storage,
      latestReport: fs.existsSync(latestReport) ? latestReport : null,
      recentRuns: (state.runs || []).slice(0, 5),
    },
    null,
    2
  )
);
