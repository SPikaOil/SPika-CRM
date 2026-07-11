// Store locator appearance settings — stored as JSON in app_settings
// under key 'store_locator'. Shared by the public map, the admin map and
// the Settings editor so they always agree.

export type PinShape = 'pin' | 'dot' | 'square'
export type MapStyle = 'standard' | 'light' | 'dark' | 'voyager'

// Categories drive pin colour. The list is DYNAMIC: these are the seeded
// defaults, but new categories (e.g. "snack bar") can be added any time and
// automatically surface in Settings to get their own colour.
export const DEFAULT_CATEGORIES = ['supermarket', 'restaurant', 'hotel', 'shop', 'other'] as const

const SEED_LABELS: Record<string, string> = {
  supermarket: 'Supermarket',
  restaurant: 'Restaurant / Café',
  hotel: 'Hotel',
  shop: 'Specialty shop',
  other: 'Other',
}

// Human label for a category key: a known seed label, else title-cased.
export function labelForCategory(cat: string): string {
  const key = (cat || 'other').toLowerCase()
  if (SEED_LABELS[key]) return SEED_LABELS[key]
  return key.replace(/\b\w/g, c => c.toUpperCase())
}

export interface StoreLocatorSettings {
  pinShape: PinShape
  mapStyle: MapStyle
  defaultZoom: number
  center: { lat: number; lng: number }
  introText: string
  colorByCategory: boolean
  pinColor: string                       // fallback / when colorByCategory is off
  categoryColors: Record<string, string> // dynamic — any category can be added
}

// A neutral default colour for a category that has no colour set yet
export const DEFAULT_CATEGORY_COLOR = '#6b7280'

export const DEFAULT_SETTINGS: StoreLocatorSettings = {
  pinShape: 'pin',
  mapStyle: 'voyager',
  defaultZoom: 11,
  center: { lat: 12.1696, lng: -68.99 }, // Curaçao
  introText: '',
  colorByCategory: true,
  pinColor: '#dc2626',
  categoryColors: {
    supermarket: '#2563eb', // blue
    restaurant: '#dc2626',  // red
    hotel: '#7c3aed',       // purple
    shop: '#16a34a',        // green
    other: '#6b7280',       // gray
  },
}

// Free tile providers (no API key). Attribution is required and included.
export const TILE_LAYERS: Record<MapStyle, { url: string; attribution: string }> = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
}

export function categoryColor(settings: StoreLocatorSettings, category: string): string {
  if (!settings.colorByCategory) return settings.pinColor
  const c = (category || 'other').toLowerCase()
  return settings.categoryColors[c] ?? settings.pinColor
}

// SVG markup + Leaflet sizing for a pin of the given shape/colour.
export function pinSvg(color: string, shape: PinShape): { html: string; size: [number, number]; anchor: [number, number]; popupAnchor: [number, number] } {
  if (shape === 'dot') {
    return {
      html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="9" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`,
      size: [22, 22], anchor: [11, 11], popupAnchor: [0, -11],
    }
  }
  if (shape === 'square') {
    return {
      html: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`,
      size: [24, 24], anchor: [12, 12], popupAnchor: [0, -12],
    }
  }
  // classic teardrop pin
  return {
    html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 26 14 26s14-16 14-26C28 6.3 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
    size: [28, 40], anchor: [14, 40], popupAnchor: [0, -38],
  }
}
