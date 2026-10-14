export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalBox = globalThis as typeof globalThis & { __googleClockTimer?: boolean };
  const { ensureGoogleTime } = await import("@/lib/google-time");
  try {
    await ensureGoogleTime(true);
  } catch (error) {
    console.error("Google time sync failed", error);
  }
  if (globalBox.__googleClockTimer) return;
  globalBox.__googleClockTimer = true;
  setInterval(() => {
    void ensureGoogleTime(true).catch((error) => {
      console.error("Google time sync failed", error);
    });
  }, 4 * 60 * 1000);
}
