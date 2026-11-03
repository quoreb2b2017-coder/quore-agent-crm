import fs from "node:fs";
import path from "node:path";

/**
 * Exclusive process lock to prevent overlapping launchd jobs.
 * Stale locks (dead PID / older than maxAgeMs) are cleared.
 */
export function acquireLock(stateDir, { maxAgeMs = 3 * 60 * 60 * 1000 } = {}) {
  const lockPath = path.join(stateDir, "backup.lock");
  fs.mkdirSync(stateDir, { recursive: true });

  const tryCreate = () => {
    const fd = fs.openSync(lockPath, "wx");
    const payload = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: process.env.HOSTNAME || null,
    };
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
    fs.closeSync(fd);
    return {
      lockPath,
      release() {
        try {
          const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          if (current.pid === process.pid) fs.unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
      },
    };
  };

  try {
    return tryCreate();
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }

  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    fs.unlinkSync(lockPath);
    return tryCreate();
  }

  const startedMs = Date.parse(existing.startedAt || "") || 0;
  const staleByAge = !startedMs || Date.now() - startedMs > maxAgeMs;
  const staleByPid = existing.pid && !isPidAlive(existing.pid);

  if (staleByAge || staleByPid) {
    fs.unlinkSync(lockPath);
    return tryCreate();
  }

  throw new Error(
    `Another backup is running (pid ${existing.pid}, started ${existing.startedAt}). Skipping overlap.`
  );
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}
