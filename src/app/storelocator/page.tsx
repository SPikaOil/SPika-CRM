'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Pin } from './locator-map'
import { DEFAULT_SETTINGS, type StoreLocatorSettings } from '@/lib/store-locator-settings'

// Leaflet needs the browser — load the map client-only
const LocatorMap = dynamic(() => import('./locator-map').then(m => m.LocatorMap), {
  ssr: false,
  loading: () => <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading map…</div>,
})

export default function StoreLocatorPage() {
  const [pins, setPins] = useState<Pin[]>([])
  const [settings, setSettings] = useState<StoreLocatorSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('store_locations')
      .select('id, name, address, lat, lng, category, link_url')
      .eq('active', true)
      .then(({ data }) => setPins((data as Pin[]) ?? []))
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'store_locator')
      .maybeSingle()
      .then(({ data }) => {
        if ((data as any)?.value) {
          try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse((data as any).value) }) } catch { /* keep defaults */ }
        }
      })
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <LocatorMap pins={pins} settings={settings} />
    </div>
  )
}
