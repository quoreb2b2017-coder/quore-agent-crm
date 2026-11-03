export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter. Temporary network / 5xx / rate-limit only. */
export async function withBackoff(fn, {
  retries = 8,
  baseMs = 1000,
  maxMs = 60_000,
  label = "operation",
  logger,
  shouldRetry = defaultShouldRetry,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = shouldRetry(err);
      if (!retryable || attempt === retries) break;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) + Math.floor(Math.random() * 250);
      logger?.warn(`${label} failed; retrying`, {
        attempt: attempt + 1,
        delayMs: delay,
        error: String(err?.message || err),
      });
      await sleep(delay);
    }
  }
  throw lastError;
}

function defaultShouldRetry(err) {
  const message = String(err?.message || err || "").toLowerCase();
  const code = err?.code || err?.cause?.code;
  if (["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }
  if (message.includes("fetch failed") || message.includes("network") || message.includes("timeout")) {
    return true;
  }
  const status = err?.status || err?.statusCode;
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  return false;
}

export async function waitForInternet({ timeoutMs = 120_000, logger } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
        method: "GET",
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return true;
    } catch {
      /* keep trying */
    }
    logger?.warn("Waiting for internet reconnection…");
    await sleep(5_000);
  }
  throw new Error("Internet unavailable; pending backup work will retry on the next run.");
}
