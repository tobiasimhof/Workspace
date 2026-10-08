// Service Worker für Mein Workspace — PWA-Cache.
// Strategie für eigene Dateien: Netzwerk zuerst, Cache nur als Offline-Fallback.
// So kommen Änderungen von GitHub Pages beim nächsten Öffnen sofort an.
// CACHE_NAME nur hochzählen, wenn sich CORE_ASSETS oder diese Datei ändern.
const CACHE_NAME = 'workspace-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];
// Bei sehr langsamem Netz nach dieser Zeit lieber die gecachte Version zeigen.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CORE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(cached =>
    cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
  );
}

function networkFirst(event) {
  const req = event.request;
  const network = fetch(req, { cache: 'no-cache' }).then(resp => {
    if (resp && resp.ok) {
      const clone = resp.clone();
      return caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).then(() => resp);
    }
    return resp;
  });
  // Die frische Antwort soll auch dann im Cache landen, wenn schon die gecachte gezeigt wurde.
  event.waitUntil(network.catch(() => {}));

  const slow = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS))
    .then(() => fromCache(req))
    .then(cached => cached || network);

  return Promise.race([network, slow])
    .catch(() => fromCache(req).then(cached => cached || Response.error()));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate — funktioniert offline mit der Version
  // die beim letzten Online-Besuch gecacht wurde.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          const fetchPromise = fetch(req).then(resp => {
            if (resp && resp.status === 200) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Eigene Assets: Netzwerk zuerst, offline aus dem Cache.
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(event));
  }
});
