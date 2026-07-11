'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface Pin {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category: string
  link_url: string
}

// Inline SVG pin avoids Leaflet's broken default-marker image paths under bundlers
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 26 14 26s14-16 14-26C28 6.3 21.7 0 14 0z" fill="#dc2626"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
})

// Curaçao
const DEFAULT_CENTER: [number, number] = [12.1696, -68.99]
const DEFAULT_ZOOM = 11

export function LocatorMap({ pins }: { pins: Pin[] }) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pins.map(p => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon}>
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{p.name}</strong>
              {p.address && <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{p.address}</div>}
              {p.link_url && (
                <a href={p.link_url} target="_blank" rel="noreferrer"
                   style={{ color: '#dc2626', fontSize: 12, display: 'inline-block', marginTop: 4 }}>
                  Meer info →
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
