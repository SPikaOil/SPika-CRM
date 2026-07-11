'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_CATEGORY_COLOR, labelForCategory,
  type StoreLocatorSettings, type PinShape, type MapStyle,
} from '@/lib/store-locator-settings'

const PreviewMap = dynamic(() => import('@/components/map/settings-preview-map').then(m => m.SettingsPreviewMap), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>,
})

const MAP_STYLES: { value: MapStyle; label: string }[] = [
  { value: 'voyager', label: 'Voyager (colourful, clean)' },
  { value: 'standard', label: 'Standard (OpenStreetMap)' },
  { value: 'light', label: 'Light / minimal' },
  { value: 'dark', label: 'Dark' },
]
const PIN_SHAPES: { value: PinShape; label: string }[] = [
  { value: 'pin', label: 'Pin (teardrop)' },
  { value: 'dot', label: 'Dot (circle)' },
  { value: 'square', label: 'Rounded square' },
]

export function StoreLocatorSettingsCard() {
  const supabase = createClient()
  const [s, setS] = useState<StoreLocatorSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')

  useEffect(() => {
    // Load saved settings AND any categories already used on pins, so a
    // category like "snack bar" typed on the Store Locator tab automatically
    // surfaces here to get its own colour.
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'store_locator').maybeSingle(),
      supabase.from('store_locations').select('category'),
    ]).then(([setRes, locRes]) => {
      let loaded = DEFAULT_SETTINGS
      if ((setRes.data as any)?.value) {
        try { loaded = { ...DEFAULT_SETTINGS, ...JSON.parse((setRes.data as any).value) } } catch { /* keep defaults */ }
      }
      const colors: Record<string, string> = { ...loaded.categoryColors }
      // Seed defaults + surface pin categories not yet coloured
      for (const c of DEFAULT_CATEGORIES) if (!(c in colors)) colors[c] = DEFAULT_CATEGORY_COLOR
      for (const row of (locRes.data ?? [])) {
        const c = ((row as any).category || '').toLowerCase()
        if (c && !(c in colors)) colors[c] = DEFAULT_CATEGORY_COLOR
      }
      setS({ ...loaded, categoryColors: colors })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addCategory() {
    const c = newCat.trim().toLowerCase()
    if (!c) return
    if (s.categoryColors[c]) { toast.error('That category already exists'); return }
    setS(prev => ({ ...prev, categoryColors: { ...prev.categoryColors, [c]: DEFAULT_CATEGORY_COLOR } }))
    setNewCat('')
  }

  function removeCategory(cat: string) {
    setS(prev => {
      const next = { ...prev.categoryColors }
      delete next[cat]
      return { ...prev, categoryColors: next }
    })
  }

  function set<K extends keyof StoreLocatorSettings>(key: K, value: StoreLocatorSettings[K]) {
    setS(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'store_locator', value: JSON.stringify(s), updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) toast.error(`Could not save: ${error.message}`)
    else toast.success('Store locator settings saved')
  }

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4" /> Store Locator</CardTitle>
        <CardDescription>Appearance of the public website map. Pins are managed on the Store Locator tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Live preview */}
        <div className="space-y-1">
          <Label className="text-xs">Preview — click the map to set the default center</Label>
          <div className="h-56 rounded-lg overflow-hidden border">
            <PreviewMap settings={s} onCenterPick={(lat, lng) => set('center', { lat, lng })} />
          </div>
          <p className="text-xs text-muted-foreground">Center: {s.center.lat.toFixed(4)}, {s.center.lng.toFixed(4)}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Map style</Label>
            <Select value={s.mapStyle} onValueChange={v => set('mapStyle', (v as MapStyle) ?? 'voyager')}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{MAP_STYLES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pin shape</Label>
            <Select value={s.pinShape} onValueChange={v => set('pinShape', (v as PinShape) ?? 'pin')}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PIN_SHAPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default zoom</Label>
            <Input type="number" min={1} max={18} value={s.defaultZoom}
              onChange={e => set('defaultZoom', Math.min(18, Math.max(1, parseInt(e.target.value) || 11)))} className="h-9 w-24" />
          </div>
        </div>

        {/* Colour by category */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.colorByCategory} onChange={e => set('colorByCategory', e.target.checked)} />
          Colour pins by category
        </label>

        {s.colorByCategory ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.keys(s.categoryColors).sort().map(cat => (
                <div key={cat} className="flex items-center gap-2">
                  <input type="color" value={s.categoryColors[cat]}
                    onChange={e => set('categoryColors', { ...s.categoryColors, [cat]: e.target.value })}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <span className="text-sm flex-1 truncate">{labelForCategory(cat)}</span>
                  {!(DEFAULT_CATEGORIES as readonly string[]).includes(cat) && (
                    <button onClick={() => removeCategory(cat)} className="text-xs text-muted-foreground hover:text-red-600">remove</button>
                  )}
                </div>
              ))}
            </div>
            {/* Add a new category (also appears automatically when used on a pin) */}
            <div className="flex gap-2">
              <Input value={newCat} onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                placeholder="Add category, e.g. snack bar" className="h-8" />
              <Button size="sm" variant="outline" onClick={addCategory}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="color" value={s.pinColor} onChange={e => set('pinColor', e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
            <span className="text-sm">Pin colour</span>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Intro text (optional — shown as a banner on the map)</Label>
          <Textarea value={s.introText} onChange={e => set('introText', e.target.value)} rows={2}
            placeholder="e.g. Find SPika Oil at these locations across Curaçao" />
        </div>

        <Button className="bg-red-600 hover:bg-red-700" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}
