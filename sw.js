/* TMS Index Author Check: cache-busting service worker
   Bump VERSION on every deploy (and the ?v= numbers in index.html).
   HTML, CSS and JS always come from the network first, so users get the
   new version on the next load; the cache is only a fallback for offline use. */
const VERSION = "0.02";
const CACHE = "tms-index-author-check-v" + VERSION;
const ASSETS = ["./", "./index.html", "./styles.css?v=" + VERSION, "./app.js?v=" + VERSION, "./tms-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tms-index-author-check-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;  // fonts etc. go straight to the network
  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || caches.match("./index.html")))
  );
});
