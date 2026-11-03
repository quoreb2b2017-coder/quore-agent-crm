import fs from "node:fs";
import path from "node:path";
import { storageSummary } from "./state.mjs";

export function buildReport({
  runId,
  startedAt,
  finishedAt,
  trigger,
  missedHours,
  database,
  storage,
  state,
  internetOk,
  notes = [],
}) {
  const storageCounts = storageSummary(state);
  return {
    runId,
    startedAt,
    finishedAt,
    trigger,
    internetOk,
    missedHoursDetected: missedHours,
    database: {
      status: database.status,
      path: database.relativePath,
      bytes: database.bytes,
      sha256: database.sha256,
      error: database.error,
      lastSuccessfulDatabaseAt: state.lastSuccessfulDatabaseAt,
    },
    storage: {
      status: storage.status,
      bucketCount: storage.bucketCount,
      downloadedFiles: storage.stats.downloaded,
      modifiedFiles: storage.stats.modified,
      pendingFiles: storage.stats.pending,
      failedFiles: storage.stats.failed,
      recoveredFiles: storage.stats.recovered,
      verifiedUnchanged: storage.stats.verifiedUnchanged,
      discovered: storage.stats.discovered,
      verificationFailures: storage.stats.verificationFailures,
      inventory: storageCounts,
      lastSuccessfulStorageAt: state.lastSuccessfulStorageAt,
    },
    verification: {
      databaseVerified: database.status === "success" && Boolean(database.sha256),
      storagePendingOrFailed: storageCounts.pending + storageCounts.failed + storageCounts.incomplete,
      incompleteNeverMarkedSuccess: true,
    },
    lastSuccessfulBackupTimestamp: state.lastSuccessfulRunAt,
    notes,
  };
}

export function writeReport(reportDir, report) {
  fs.mkdirSync(reportDir, { recursive: true });
  const name = `report-${report.runId}.json`;
  const filePath = path.join(reportDir, name);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
  fs.renameSync(tmp, filePath);

  const latest = path.join(reportDir, "latest.json");
  fs.writeFileSync(`${latest}.tmp`, JSON.stringify(report, null, 2));
  fs.renameSync(`${latest}.tmp`, latest);

  const md = path.join(reportDir, `report-${report.runId}.md`);
  fs.writeFileSync(md, renderMarkdown(report));
  return { json: filePath, markdown: md };
}

function renderMarkdown(report) {
  return `# Backup report · ${report.runId}

- **Started:** ${report.startedAt}
- **Finished:** ${report.finishedAt}
- **Trigger:** ${report.trigger}
- **Missed hours detected:** ${report.missedHoursDetected}
- **Internet OK:** ${report.internetOk}
- **Last successful backup:** ${report.lastSuccessfulBackupTimestamp ?? "never"}

## Database
- Status: **${report.database.status}**
- Path: ${report.database.path ?? "—"}
- Bytes: ${report.database.bytes ?? 0}
- SHA-256: ${report.database.sha256 ?? "—"}
- Error: ${report.database.error ?? "—"}
- Last successful DB: ${report.database.lastSuccessfulDatabaseAt ?? "—"}

## Storage
- Status: **${report.storage.status}**
- Buckets: ${report.storage.bucketCount}
- Downloaded: ${report.storage.downloadedFiles}
- Modified: ${report.storage.modifiedFiles}
- Pending: ${report.storage.pendingFiles}
- Failed: ${report.storage.failedFiles}
- Recovered: ${report.storage.recoveredFiles}
- Verified unchanged: ${report.storage.verifiedUnchanged}
- Discovered: ${report.storage.discovered}
- Inventory: verified=${report.storage.inventory.verified}, pending=${report.storage.inventory.pending}, failed=${report.storage.inventory.failed}, incomplete=${report.storage.inventory.incomplete}

## Verification
- Database verified this run: ${report.verification.databaseVerified}
- Storage pending/failed remaining: ${report.verification.storagePendingOrFailed}
- Incomplete backups never marked successful: ${report.verification.incompleteNeverMarkedSuccess}

## Notes
${(report.notes || []).map((n) => `- ${n}`).join("\n") || "- (none)"}
`;
}
