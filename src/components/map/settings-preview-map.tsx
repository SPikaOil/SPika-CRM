'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { type StoreLocatorSettings, TILE_LAYERS, CATEGORIES, categoryColor, pinSvg } from '@/lib/store-locator-settings'

function icon(settings: StoreLocatorSettings, category: string) {
  const s = pinSvg(categoryColor(settings, category), settings.pinShape)
  return L.divIcon({ className: '', html: s.html, iconSize: s.size, iconAnchor: s.anchor })
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

// Live preview: one sample pin per category around the chosen center
export function SettingsPreviewMap({ settings, onCenterPick }: {
  settings: StoreLocatorSettings
  onCenterPick: (lat: number, lng: number) => void
}) {
  const tiles = TILE_LAYERS[settings.mapStyle] ?? TILE_LAYERS.voyager
  const c = settings.center
  const samples = CATEGORIES.map((cat, i) => {
    const angle = (i / CATEGORIES.length) * Math.PI * 2
    return { cat, lat: c.lat + Math.cos(angle) * 0.02, lng: c.lng + Math.sin(angle) * 0.03 }
  })
  return (
    <MapContainer center={[c.lat, c.lng]} zoom={settings.defaultZoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution={tiles.attribution} url={tiles.url} />
      <ClickHandler onPick={onCenterPick} />
      {samples.map(s => (
        <Marker key={s.cat} position={[s.lat, s.lng]} icon={icon(settings, s.cat)} />
      ))}
    </MapContainer>
  )
}
