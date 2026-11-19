const CACHE_NAME = "hbk-static-v2";

// Only cache Next.js versioned static assets — never HTML (authenticated content)
const STATIC_PATTERNS = [
  /\/_next\/static\//,   // JS chunks, CSS
  /\/icons\//,           // PWA icons
  /\/manifest\.json/,    // Web app manifest
];

self.addEventListener("install", () => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NEVER cache: HTML pages, API calls, Supabase requests
  // These always contain authenticated/sensitive data
  if (
    url.hostname.includes("supabase.co") ||
    request.headers.get("accept")?.includes("text/html") ||
    url.pathname === "/" ||
    url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/location") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/taxdocs") ||
    url.pathname.startsWith("/api")
  ) {
    // Network-only for all authenticated routes
    return;
  }

  // Cache-first for static assets only
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        });
      })
    );
  }
  // All other requests: network-only (no caching)
});
