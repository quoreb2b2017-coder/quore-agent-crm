import { getPushPublicKey, savePushSubscription } from "@/lib/actions/push-subscriptions";
import { subscribeBrowserPush } from "@/lib/push/browser";

/** Asks for permission if needed, subscribes this browser, and saves it for the signed-in person. */
export async function enableDesktopNotifications() {
  const { publicKey } = await getPushPublicKey();
  if (!publicKey) throw new Error("Push is not configured on the server.");
  const sub = await subscribeBrowserPush(publicKey);
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser returned an incomplete subscription.");
  }
  const result = await savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent.slice(0, 500),
  });
  if (result.error) throw new Error(result.error);
  return json.endpoint;
}
