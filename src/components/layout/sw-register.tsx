'use client'

import { useEffect } from 'react'

/**
 * The service worker generations that were genuinely poisoned — v2 cached JS
 * cache-first forever, which is what caused blank downloads and garbled first
 * loads on phones. A device still carrying one of these must be cleaned out
 * once.
 *
 * WHY A LIST AND NOT "anything that is not the current version": that is what
 * this file used to do, against a hardcoded `spika-crm-v5`. When sw.js was
 * bumped to v6 (commit 426a56d) this file was not, so the cache sw.js had just
 * created was judged stale on the very next load. Every session then ran:
 * register -> create v6 -> declare it stale -> unregister everything, wipe all
 * caches, reload -> register again. One wasted reload per session, and JS
 * chunks failing mid-teardown — which is exactly what a "weird" preview looks
 * like. An explicit list cannot drift: bumping sw.js again is now harmless,
 * because sw.js already deletes older caches itself on activate.
 */
const POISONED_CACHES = ['spika-crm-v2', 'spika-crm-v3', 'spika-crm-v4']

/** Local development is served fresh by the dev server; a cache layer on top
 *  of it only ever hides the change you just made. */
function isLocalhost() {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    ;(async () => {
      // Never run a service worker against the dev server. Anything already
      // registered from an earlier session is torn down so the preview shows
      // the code as it is on disk.
      if (isLocalhost()) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        } catch {
          // best effort — a failure here must never break the page
        }
        return
      }

      try {
        const cacheKeys = await caches.keys()
        const poisoned = cacheKeys.filter(k => POISONED_CACHES.includes(k))

        if (poisoned.length > 0) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
          await Promise.all(cacheKeys.map(k => caches.delete(k)))
          if (!sessionStorage.getItem('sw-recovered')) {
            sessionStorage.setItem('sw-recovered', '1')
            window.location.reload()
            return
          }
        }
      } catch {
        // recovery is best-effort — never block registration
      }

      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed silently
      })
    })()
  }, [])

  return null
}
