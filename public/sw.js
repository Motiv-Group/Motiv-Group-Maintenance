// v8 — offline fallback + static-asset caching + prompted update (was: push-only)

const CACHE = 'motiv-v8'
// Precached at install: the offline page + the icons it/the OS need.
const PRECACHE = ['/offline.html', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE) })
  )
  // NB: no unconditional skipWaiting() here. A freshly-installed SW parks in the
  // "waiting" state so the running page isn't swapped out mid-session; the page
  // shows an update toast and only posts SKIP_WAITING (below) when the user opts
  // in. Content-hashed _next/static URLs make the deferred swap safe.
})

// Client opt-in to take over: the update toast posts this once the user clicks
// Refresh. activate → clients.claim() then triggers a single controllerchange.
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE }).map(function (k) { return caches.delete(k) }))
    }).then(function () { return clients.claim() })
  )
})

// Only ever handle same-origin GETs. Never touch API calls, auth, Supabase, or
// any cross-origin request — those must always hit the network unmodified.
function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') ||
         url.pathname.startsWith('/brand/') ||
         url.pathname === '/icon-192.png' ||
         url.pathname === '/icon-512.png' ||
         url.pathname === '/offline.html'
}

self.addEventListener('fetch', function (event) {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Page navigations: network-first (the app is server-rendered and live),
  // falling back to the precached offline page when the network is gone.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('/offline.html')
      })
    )
    return
  }

  // Hashed/static assets: cache-first with background fill. Content-hashed
  // filenames make stale-cache bugs impossible; unhashed brand/icon files are
  // small and refreshed whenever the SW version bumps.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit
        return fetch(req).then(function (res) {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(function (cache) { cache.put(req, copy) })
          }
          return res
        })
      })
    )
  }
  // Everything else (API routes, dynamic data): untouched — straight to network.
})

self.addEventListener('push', function (event) {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Motiv', {
      body:     data.body ?? '',
      badge:    '/icon-192.png',
      vibrate:  [200, 100, 200],
      tag:      data.url ?? '/',
      renotify: false,
      data:     { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus()
            if ('navigate' in client) client.navigate(url)
            return
          }
        }
        if (clients.openWindow) return clients.openWindow(url)
      })
  )
})
