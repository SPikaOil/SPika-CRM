'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { MapPin, Loader2, Plus, Trash2, Check, X, Copy, ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const PinPickerMap = dynamic(() => import('@/components/map/pin-picker-map').then(m => m.PinPickerMap), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>,
})

interface Loc {
  id: string
  customer_id: string | null
  name: string
  address: string
  lat: number
  lng: number
  category: string
  link_url: string
  active: boolean
}

const EMPTY = { customer_id: '', name: '', address: '', category: '', link_url: '', active: true, lat: null as number | null, lng: null as number | null }

export default function StoreLocatorAdminPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [locs, setLocs] = useState<Loc[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  async function load() {
    const [locsRes, custRes] = await Promise.all([
      supabase.from('store_locations').select('*').order('name'),
      supabase.from('customers').select('id, company_name, display_as, billing_address').order('company_name'),
    ])
    setLocs((locsRes.data as Loc[]) ?? [])
    setCustomers(custRes.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  function reset() { setForm(EMPTY); setEditingId(null) }

  function startEdit(l: Loc) {
    setEditingId(l.id)
    setForm({
      customer_id: l.customer_id ?? '', name: l.name, address: l.address,
      category: l.category, link_url: l.link_url, active: l.active, lat: l.lat, lng: l.lng,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function prefillFromCustomer(id: string) {
    const c = customers.find(x => x.id === id)
    if (!c) { setForm(f => ({ ...f, customer_id: '' })); return }
    const ba = c.billing_address ?? {}
    setForm(f => ({
      ...f,
      customer_id: id,
      name: f.name || c.display_as || c.company_name || '',
      address: f.address || [ba.street, ba.city].filter(Boolean).join(', '),
    }))
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (form.lat == null || form.lng == null) { toast.error('Click on the map to place the pin'); return }
    setSaving(true)
    const payload = {
      customer_id: form.customer_id || null,
      name: form.name.trim(), address: form.address.trim(),
      category: form.category.trim(), link_url: form.link_url.trim(),
      active: form.active, lat: form.lat, lng: form.lng,
      updated_at: new Date().toISOString(),
    }
    const res = editingId
      ? await supabase.from('store_locations').update(payload).eq('id', editingId)
      : await supabase.from('store_locations').insert(payload)
    setSaving(false)
    if (res.error) { toast.error(res.error.message); return }
    toast.success(editingId ? 'Location updated' : 'Location added')
    reset(); load()
  }

  async function toggleActive(l: Loc) {
    await supabase.from('store_locations').update({ active: !l.active }).eq('id', l.id)
    setLocs(prev => prev.map(x => x.id === l.id ? { ...x, active: !x.active } : x))
  }

  async function confirmDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('store_locations').delete().eq('id', deleteId)
    if (error) { toast.error(error.message); return }
    setDeleteId(null); load()
  }

  const embedUrl = typeof window !== 'undefined' ? `${window.location.origin}/storelocator` : '/storelocator'

  if (authLoading || !isAdmin) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-red-600" /> Store Locator
        </h1>
        <p className="text-muted-foreground text-sm">Pins shown on the public website map</p>
      </div>

      {/* Add / edit */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">{editingId ? 'Edit location' : 'Add location'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Prefill from customer (optional)</Label>
            <Select value={form.customer_id || 'none'} onValueChange={v => prefillFromCustomer(v && v !== 'none' ? v : '')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose a customer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.display_as || c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Pin name (shown on map)</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Van der Tweel Zeelandia" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category (optional)</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="supermarket / restaurant / hotel" className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address (optional)</Label>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Link (optional — website or Google Maps)</Label>
            <Input value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://…" className="h-9" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Click on the map to place the pin (drag to adjust)</Label>
            <div className="h-64 rounded-lg overflow-hidden border">
              <PinPickerMap lat={form.lat} lng={form.lng} onPick={(lat, lng) => setForm(f => ({ ...f, lat, lng }))} />
            </div>
            {form.lat != null && (
              <p className="text-xs text-muted-foreground">📍 {form.lat.toFixed(5)}, {form.lng!.toFixed(5)}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Show on public locator
          </label>

          <div className="flex gap-2">
            <Button className="bg-red-600 hover:bg-red-700" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> {editingId ? 'Save' : 'Add'}</>}
            </Button>
            {editingId && <Button variant="outline" onClick={reset}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      {/* Embed instructions */}
      <Card className="py-3 gap-2">
        <CardHeader><CardTitle className="text-sm">Put the map on your website</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            In Shopify, add a section with a <strong>Custom Liquid</strong> block and paste this. The map updates
            automatically when you change pins here.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
              {`<iframe src="${embedUrl}" style="width:100%;height:520px;border:0" loading="lazy"></iframe>`}
            </code>
            <Button size="icon" variant="outline" className="shrink-0" onClick={() => {
              navigator.clipboard.writeText(`<iframe src="${embedUrl}" style="width:100%;height:520px;border:0" loading="lazy"></iframe>`)
              toast.success('Embed code copied')
            }}><Copy className="h-4 w-4" /></Button>
            <a href={embedUrl} target="_blank" rel="noreferrer">
              <Button size="icon" variant="outline" className="shrink-0"><ExternalLink className="h-4 w-4" /></Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? <Skeleton className="h-24 rounded-xl" /> : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {locs.length} location{locs.length !== 1 ? 's' : ''}
          </p>
          {locs.map(l => (
            <Card key={l.id} className={`py-0 ${l.active ? '' : 'opacity-60'}`}>
              <CardContent className="py-2.5 px-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    {!l.active && <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">Hidden</Badge>}
                  </div>
                  {l.address && <p className="text-xs text-muted-foreground truncate">{l.address}</p>}
                </div>
                <button onClick={() => toggleActive(l)} title={l.active ? 'Hide' : 'Show'}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0">
                  {l.active ? 'Hide' : 'Show'}
                </button>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => startEdit(l)}>Edit</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => setDeleteId(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
          {locs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No locations yet</p>}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl w-full max-w-sm shadow-xl p-4 space-y-3">
            <p className="font-semibold flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" /> Delete location?</p>
            <p className="text-sm text-muted-foreground">This removes the pin from the website map.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
