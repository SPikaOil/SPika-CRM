'use client'

import { useEffect } from 'react'

const CURRENT_CACHE = 'spika-crm-v4'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    ;(async () => {
      try {
        // One-time recovery: devices that ran the old v2 service worker are
        // stuck with poisoned cache-first JS (blank downloads, garbled first
        // loads). If we detect leftovers from any other SW generation, nuke
        // every registration and cache, then reload once to start clean.
        const cacheKeys = await caches.keys()
        const hasStaleCaches = cacheKeys.some(k => k !== CURRENT_CACHE)
        const controlledWithoutCurrent =
          navigator.serviceWorker.controller != null && !cacheKeys.includes(CURRENT_CACHE)

        if (hasStaleCaches || controlledWithoutCurrent) {
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
