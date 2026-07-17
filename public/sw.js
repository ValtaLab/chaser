/// <reference lib="webworker" />

const CACHE_NAME = "chaser-v15";
const SW_VERSION = "5.8.0";
const WORKER_URL = "https://chaser-auth.isearover.workers.dev";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192-v2.png",
  "/icon-512-v2.png",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean ALL old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for ALL same-origin requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // API calls: network-first, fallback to cache
  if (
    url.hostname.includes("data.gov.hk") ||
    url.hostname.includes("rt.data.gov.hk") ||
    url.hostname.includes("mtr") ||
    url.pathname.startsWith("/api/")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Map tiles: cache-first (these don't change)
  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // ALL same-origin requests: network-first (HTML, JS, CSS, images)
  // This ensures users always get the latest version
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  // If push has inline data, use it directly (backwards compatibility)
  if (event.data) {
    try {
      const data = event.data.json();
      event.waitUntil(
        self.registration.showNotification(data.title || "到站提醒", {
          body: data.body || "",
          icon: "/icon-192-v2.png",
          badge: "/icon-192-v2.png",
          data: { url: data.url || "/" },
          actions: [
            { action: "open", title: "開啟" },
            { action: "dismiss", title: "忽略" },
          ],
        })
      );
      return;
    } catch {}
  }

  // Empty push (no payload) — fetch notification content from worker
  event.waitUntil(
    fetch(`${WORKER_URL}/pending-notification`)
      .then((res) => {
        if (!res.ok) throw new Error("no pending");
        return res.json();
      })
      .then((data) => {
        return self.registration.showNotification(data.title || "到站提醒", {
          body: data.body || "",
          icon: "/icon-192-v2.png",
          badge: "/icon-192-v2.png",
          data: { url: "/" },
          actions: [
            { action: "open", title: "開啟" },
            { action: "dismiss", title: "忽略" },
          ],
        });
      })
      .catch(() => {
        // No pending notification — do nothing
      })
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
