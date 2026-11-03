/* WorkTrack Web Push service worker — keeps OS notifications working when the tab is backgrounded or closed. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(openOrFocus(url));
});

async function handlePush(event) {
  let payload = {
    id: "",
    title: "WorkTrack",
    body: "",
    url: "/",
    type: "",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* ignore malformed payloads */
  }

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const focused = clients.some((client) => client.focused);
  // Avoid duplicate OS banner when the user already sees the in-app toast via Socket.IO.
  if (focused) {
    for (const client of clients) {
      client.postMessage({ type: "worktrack:push-suppressed", id: payload.id });
    }
    return;
  }

  for (const client of clients) {
    client.postMessage({ type: "worktrack:notification", id: payload.id });
  }

  await self.registration.showNotification(payload.title || "WorkTrack", {
    body: payload.body || "",
    tag: payload.id ? `worktrack-${payload.id}` : "worktrack-notification",
    renotify: Boolean(payload.id),
    data: { url: payload.url || "/", id: payload.id, type: payload.type },
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  });
}

async function openOrFocus(url) {
  const absolute = new URL(url, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client && client.url !== absolute) {
        try {
          await client.navigate(absolute);
        } catch {
          /* older browsers */
        }
      }
      return;
    }
  }
  await self.clients.openWindow(absolute);
}
