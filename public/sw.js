const CACHE_NAME = 'spika-crm-v3'

const STATIC_ASSETS = [
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never intercept navigation requests — let the browser/middleware handle auth redirects
  if (request.mode === 'navigate') return

  // Network-first for API and Supabase calls
  if (request.url.includes('supabase.co') || request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    )
    return
  }

  // JS and CSS: network-first. Serving stale app code from cache after a
  // deploy mixes old and new bundles and breaks the app (blank downloads on
  // iOS). The cache is only a fallback for offline use.
  if (request.method === 'GET' && /\.(js|css)(\?|$)/.test(request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Images and fonts are immutable enough for cache-first
  if (request.method === 'GET' && /\.(png|jpg|jpeg|svg|webp|woff2?)(\?|$)/.test(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
  }
})
