/** Browser helpers for Web Push (Client Components only). */

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function ensurePushServiceWorker() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    // Pick up a changed sw.js now rather than at the browser's next check.
    void existing.update().catch(() => null);
    return existing;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeBrowserPush(publicKey: string) {
  if (!(await ensurePushServiceWorker())) throw new Error("Service worker unavailable");
  // A first-time worker is still installing, and subscribing needs an active one.
  const registration = await navigator.serviceWorker.ready;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  const serverKey = urlBase64ToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const currentKey = existing.options.applicationServerKey;
    const sameKey =
      currentKey != null &&
      new Uint8Array(currentKey).every((byte, index) => byte === serverKey[index]) &&
      currentKey.byteLength === serverKey.length;
    if (sameKey) return existing;
    // Made with an older server key, so the push service would refuse every alert.
    await existing.unsubscribe();
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  });
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
