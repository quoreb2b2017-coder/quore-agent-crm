import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withBackoff } from "./retry.mjs";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Fresh complete database snapshot via pg_dump.
 * Writes to a temp file first; only promotes after non-empty verified dump.
 * Previous successful snapshots are never deleted or overwritten.
 */
export async function backupDatabase(config, { logger }) {
  const startedAt = new Date().toISOString();
  const finalName = `postgres-${stamp()}.dump`;
  const finalPath = path.join(config.dbDir, finalName);
  const partialPath = `${finalPath}.partial`;
  const metaPath = `${finalPath}.meta.json`;

  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath);
    logger.warn("Removed incomplete database dump partial from a prior interrupted run");
  }

  try {
    await withBackoff(
      async () => {
        await runPgDump(config, partialPath, logger);
        const stat = fs.statSync(partialPath);
        if (!stat.size || stat.size < 64) {
          throw new Error("pg_dump produced an empty or tiny file — treating as failed");
        }
        const sha256 = await sha256File(partialPath);
        fs.renameSync(partialPath, finalPath);
        const meta = {
          startedAt,
          finishedAt: new Date().toISOString(),
          path: finalPath,
          relativePath: path.relative(config.backupRoot, finalPath),
          bytes: stat.size,
          sha256,
          format: "custom",
          tool: config.pgDumpBin,
          note: "Fresh complete snapshot for this cycle. Older snapshots remain intact.",
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        return meta;
      },
      { retries: 4, label: "database pg_dump", logger }
    );

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    logger.info("Database snapshot verified", {
      path: meta.relativePath,
      bytes: meta.bytes,
      sha256: meta.sha256,
    });
    return {
      status: "success",
      path: finalPath,
      relativePath: meta.relativePath,
      bytes: meta.bytes,
      sha256: meta.sha256,
      startedAt,
      finishedAt: meta.finishedAt,
      error: null,
    };
  } catch (err) {
    if (fs.existsSync(partialPath)) {
      try {
        fs.unlinkSync(partialPath);
      } catch {
        /* keep for forensics if unlink fails */
      }
    }
    const error = String(err?.message || err);
    logger.error("Database backup failed — will retry next run; not marked successful", { error });
    return {
      status: "failed",
      path: null,
      relativePath: null,
      bytes: 0,
      sha256: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      error,
    };
  }
}

function runPgDump(config, outPath, logger) {
  return new Promise((resolve, reject) => {
    const args = [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--verbose",
      `--file=${outPath}`,
      config.databaseUrl,
    ];
    logger.info("Starting pg_dump", { bin: config.pgDumpBin });
    const child = spawn(config.pgDumpBin, args, {
      env: { ...process.env, PGCONNECT_TIMEOUT: "30" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start ${config.pgDumpBin}: ${err.message}. Install PostgreSQL client tools (pg_dump).`
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited ${code}: ${stderr.slice(-4000)}`));
    });
  });
}
