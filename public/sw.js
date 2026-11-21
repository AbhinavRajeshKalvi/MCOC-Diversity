// War Room service worker: shows push notifications and opens the right page
// when one is tapped. Kept deliberately small; it does no offline caching.

// The server can be slow to answer after it has been idle, and the installed
// app would otherwise sit on a blank screen. So opening a page races the
// server against a short timer: if the server hasn't answered by then, a
// cached launch screen (/splash.html) is shown right away. It keeps asking for
// the real page and switches to it as soon as the server is ready.
// Bump this when the files below change.
const CACHE = "warroom-shell-v1";
const SHELL = ["/splash.html", "/icons/icon-192.png"];
const SPLASH_AFTER_MS = 600;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE && name.startsWith("warroom-")).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.get("x-splash-probe")) return;

  // Next's build output is fingerprinted, so a saved copy never goes stale.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === "navigate" && !url.pathname.startsWith("/api/") && url.pathname !== "/splash.html") {
    event.respondWith(
      (async () => {
        const network = fetch(request);
        const early = await Promise.race([
          network.then((response) => response, () => null),
          new Promise((resolve) => setTimeout(() => resolve("slow"), SPLASH_AFTER_MS))
        ]);
        if (early && early !== "slow") return early;
        if (early === null) return network; // offline or failed: let the browser show its own error
        // Still waiting: show the launch screen. The page it loads will ask again.
        const splash = await caches.match("/splash.html");
        if (!splash) return network;
        const to = url.pathname + url.search;
        event.waitUntil(network.catch(() => undefined)); // keep the request going so the server wakes up
        return Response.redirect(self.location.origin + "/splash.html?to=" + encodeURIComponent(to), 302);
      })()
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "War Room";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

// Browsers occasionally replace a subscription. Send the new one to the server
// so notifications keep arriving without the member turning them on again.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription && event.oldSubscription.options;
      if (!options || !options.applicationServerKey) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: options.applicationServerKey
      });
      await fetch("/api/push/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
    })().catch(() => undefined)
  );
});
