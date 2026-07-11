'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { type StoreLocatorSettings, DEFAULT_SETTINGS, TILE_LAYERS, categoryColor, pinSvg } from '@/lib/store-locator-settings'

function makeIcon(settings: StoreLocatorSettings, category: string) {
  const s = pinSvg(categoryColor(settings, category), settings.pinShape)
  return L.divIcon({ className: '', html: s.html, iconSize: s.size, iconAnchor: s.anchor })
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

export function PinPickerMap({
  lat, lng, category = 'other', settings = DEFAULT_SETTINGS, onPick,
}: {
  lat: number | null
  lng: number | null
  category?: string
  settings?: StoreLocatorSettings
  onPick: (lat: number, lng: number) => void
}) {
  const hasPin = lat != null && lng != null
  const tiles = TILE_LAYERS[settings.mapStyle] ?? TILE_LAYERS.voyager
  return (
    <MapContainer
      center={hasPin ? [lat!, lng!] : [settings.center.lat, settings.center.lng]}
      zoom={hasPin ? 15 : settings.defaultZoom}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer attribution={tiles.attribution} url={tiles.url} />
      <ClickHandler onPick={onPick} />
      {hasPin && (
        <Marker
          position={[lat!, lng!]}
          icon={makeIcon(settings, category)}
          draggable
          eventHandlers={{ dragend(e) { const p = e.target.getLatLng(); onPick(p.lat, p.lng) } }}
        />
      )}
    </MapContainer>
  )
}
