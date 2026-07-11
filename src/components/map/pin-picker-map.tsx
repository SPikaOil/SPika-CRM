'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 26 14 26s14-16 14-26C28 6.3 21.7 0 14 0z" fill="#dc2626"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 40], iconAnchor: [14, 40],
})

const DEFAULT_CENTER: [number, number] = [12.1696, -68.99] // Curaçao
const DEFAULT_ZOOM = 11

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

export function PinPickerMap({
  lat, lng, onPick,
}: {
  lat: number | null
  lng: number | null
  onPick: (lat: number, lng: number) => void
}) {
  const hasPin = lat != null && lng != null
  return (
    <MapContainer
      center={hasPin ? [lat!, lng!] : DEFAULT_CENTER}
      zoom={hasPin ? 15 : DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      {hasPin && (
        <Marker
          position={[lat!, lng!]}
          icon={pinIcon}
          draggable
          eventHandlers={{ dragend(e) { const p = e.target.getLatLng(); onPick(p.lat, p.lng) } }}
        />
      )}
    </MapContainer>
  )
}
