/**
 * RIO Service Worker v5
 * - Network-first for navigation and API
 * - Cache-first for static assets (fonts, images, icons)
 * - Offline fallback page
 * - Push notification handler (scaffolding)
 */
const CACHE_NAME = "rio-pwa-v5";
const OFFLINE_URL = "/m/offline";

// Pre-cache the app shell on install
const APP_SHELL = [
  "/m/approvals",
  "/m/receipts",
  "/m/ledger",
  "/m/settings",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean ALL old caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: DO NOT intercept — let the browser handle them directly.
  // Using event.respondWith(fetch(request)) strips credentials (cookies).
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // NEVER cache Vite dev server assets (HMR, @fs, @vite, node_modules, etc.)
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.includes("__vite") ||
    url.pathname.includes(".vite/") ||
    url.searchParams.has("v") ||
    url.searchParams.has("t")
  ) {
    return;
  }

  // Static assets from CDN (fonts, images): cache-first
  if (
    url.hostname.includes("cloudfront.net") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(
          () =>
            caches.match(request).then((cached) => cached) ||
            caches.match("/m/approvals")
        )
    );
    return;
  }

  // All other requests: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Push Notification Handler ─────────────────────────────────────────
// Scaffolding for when the backend push endpoint is wired
self.addEventListener("push", (event) => {
  let data = { title: "RIO Governance", body: "Action requires your approval" };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // fallback to default
  }

  const options = {
    body: data.body || "Action requires your approval",
    icon: "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/icon-192x192_f5f5af9a.png",
    badge: "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/icon-96x96_0fbc2ebd.png",
    vibrate: [200, 100, 200],
    tag: data.intentId || "rio-approval",
    renotify: true,
    data: {
      url: data.url || "/m/approvals",
      intentId: data.intentId,
    },
    actions: [
      { action: "approve", title: "Approve" },
      { action: "deny", title: "Deny" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title || "RIO Governance", options));
});

// Handle notification click — open the app to the right screen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/m/approvals";

  // If user clicked an action button (approve/deny), we could handle it here
  // For now, just open the app
  if (event.action === "approve" || event.action === "deny") {
    // Future: POST to /api/trpc to approve/deny directly from notification
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
