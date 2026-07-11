'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Pin } from './locator-map'
import { DEFAULT_SETTINGS, type StoreLocatorSettings, categoryColor, labelForCategory } from '@/lib/store-locator-settings'

// Leaflet needs the browser — load the map client-only
const LocatorMap = dynamic(() => import('./locator-map').then(m => m.LocatorMap), {
  ssr: false,
  loading: () => <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading map…</div>,
})

export default function StoreLocatorPage() {
  const [pins, setPins] = useState<Pin[]>([])
  const [settings, setSettings] = useState<StoreLocatorSettings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [query, setQuery] = useState('')

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? pins.filter(p => `${p.name} ${p.address} ${p.category}`.toLowerCase().includes(q))
      : pins
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [pins, query])

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Toggle bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #eee', background: '#fff' }}>
        <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          {(['map', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: view === v ? '#dc2626' : '#fff', color: view === v ? '#fff' : '#444',
              }}>
              {v === 'map' ? 'Map' : 'List'}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search location…"
            style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, outline: 'none' }}
          />
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{filtered.length} locations</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {view === 'map' ? (
          <LocatorMap pins={filtered} settings={settings} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: '#fafafa' }}>
            {settings.introText && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: '#444', background: '#fff', borderBottom: '1px solid #eee' }}>
                {settings.introText}
              </div>
            )}
            {filtered.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 14 }}>No locations found.</p>
            )}
            {filtered.map(p => (
              <a key={p.id}
                 href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                 target="_blank" rel="noreferrer"
                 style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderBottom: '1px solid #eee', textDecoration: 'none', color: 'inherit', background: '#fff' }}>
                <span style={{ marginTop: 3, width: 12, height: 12, borderRadius: '50%', background: categoryColor(settings, p.category), flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111' }}>{p.name}</span>
                  {p.address && <span style={{ display: 'block', fontSize: 12, color: '#666' }}>{p.address}</span>}
                  {p.category && <span style={{ display: 'block', fontSize: 11, color: '#999', marginTop: 1 }}>{labelForCategory(p.category)}</span>}
                </span>
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap', marginTop: 2 }}>Route →</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
