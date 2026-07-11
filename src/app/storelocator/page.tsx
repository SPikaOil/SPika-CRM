'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Pin } from './locator-map'

// Leaflet needs the browser — load the map client-only
const LocatorMap = dynamic(() => import('./locator-map').then(m => m.LocatorMap), {
  ssr: false,
  loading: () => <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading map…</div>,
})

export default function StoreLocatorPage() {
  const [pins, setPins] = useState<Pin[]>([])

  useEffect(() => {
    createClient()
      .from('store_locations')
      .select('id, name, address, lat, lng, category, link_url')
      .eq('active', true)
      .then(({ data }) => setPins((data as Pin[]) ?? []))
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <LocatorMap pins={pins} />
    </div>
  )
}
