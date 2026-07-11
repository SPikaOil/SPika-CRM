'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  type StoreLocatorSettings, DEFAULT_SETTINGS,
  TILE_LAYERS, categoryColor, pinSvg,
} from '@/lib/store-locator-settings'

export interface Pin {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category: string
  link_url: string
}

function iconFor(settings: StoreLocatorSettings, category: string) {
  const color = categoryColor(settings, category)
  const s = pinSvg(color, settings.pinShape)
  return L.divIcon({ className: '', html: s.html, iconSize: s.size, iconAnchor: s.anchor, popupAnchor: s.popupAnchor })
}

export function LocatorMap({ pins, settings = DEFAULT_SETTINGS }: { pins: Pin[]; settings?: StoreLocatorSettings }) {
  const tiles = TILE_LAYERS[settings.mapStyle] ?? TILE_LAYERS.voyager
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[settings.center.lat, settings.center.lng]} zoom={settings.defaultZoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        {pins.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={iconFor(settings, p.category)}>
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

      {settings.introText && (
        <div style={{
          position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000, pointerEvents: 'none',
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{
            pointerEvents: 'auto', background: 'rgba(255,255,255,0.94)', borderRadius: 10,
            padding: '8px 14px', maxWidth: 520, boxShadow: '0 1px 6px rgba(0,0,0,.15)',
            fontSize: 13, color: '#222', textAlign: 'center',
          }}>
            {settings.introText}
          </div>
        </div>
      )}
    </div>
  )
}
