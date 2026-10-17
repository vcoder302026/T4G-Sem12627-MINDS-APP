// Service worker: makes the app open instantly and work with poor signal.
// - App files: served from cache, refreshed in the background.
// - QR libraries and fonts (pinned versions on CDNs): cached on first use.
// - API calls (POST to Apps Script) are never cached.
// The GitHub Actions deploy replaces __BUILD__ with the commit SHA, so each
// deploy gets a fresh cache.

const CACHE = 'minds-volunteers-__BUILD__';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/on-the-day.svg',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/media.js',
  './js/qr.js',
  './js/ui.js',
  './js/views/auth.js',
  './js/views/content.js',
  './js/views/profile.js',
  './js/views/trainees.js',
  './js/views/volunteer.js',
  './js/admin/kit.js',
  './js/admin/views/attendance.js',
  './js/admin/views/fundraising.js',
  './js/admin/views/outings.js',
  './js/admin/views/overview.js',
  './js/admin/views/pairs.js',
  './js/admin/views/people.js',
  './js/admin/views/sessions.js',
  './js/admin/views/settings.js',
  './js/admin/views/trips.js',
  './js/admin/views/visits.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('minds-volunteers-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  // admin/ only redirects old dashboard links into the app: always fetch it fresh.
  if (url.pathname.includes('/admin/')) return;

  // Stale-while-revalidate for the app's own files.
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true }).then((hit) => {
      const network = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => hit || cache.match('./index.html'));
      return hit || network;
    }))
  );
});
