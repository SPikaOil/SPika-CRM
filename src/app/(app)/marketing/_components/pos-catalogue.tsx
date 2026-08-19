'use client'

import { useState } from 'react'
import { Package, Plus, Pencil, Trash2, Link2, PackageX, X, ImageOff } from 'lucide-react'
import { toast } from 'sonner'
import { POS_KINDS, posKindLabel } from '@/lib/pos'
import { parseDriveId, driveThumbnail, drivePreviewUrl, ASSET_GRID } from '@/lib/marketing'
import {
  usePosItems, useSavePosItem, useDeletePosItem, type PosItem,
} from '@/hooks/use-pos-items'
import { useMarketingAssets } from '@/hooks/use-marketing-assets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const EMPTY = {
  name: '', kind: 'display' as string, sku: '', asset_id: '',
  is_available: true, notes: '', sort_order: 0,
  photos: [] as string[],
}

/**
 * The catalogue of things we physically ship.
 *
 * Its own list rather than a ninth category on the asset grid, because these
 * rows have no file: no thumbnail, no download button, no Drive link. A rack
 * has no artwork at all — which is why it could never have been an asset,
 * marketing_assets.file_ref being NOT NULL.
 */
export function PosCatalogue({ canManage }: { canManage: boolean }) {
  const { data: items, isLoading } = usePosItems()
  const { data: assets } = useMarketingAssets(true)
  const saveItem = useSavePosItem()
  const deleteItem = useDeletePosItem()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PosItem | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [photoDraft, setPhotoDraft] = useState('')

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setPhotoDraft('')
    setDialogOpen(true)
  }

  function openEdit(item: PosItem) {
    setEditing(item)
    setForm({
      name: item.name,
      kind: item.kind,
      sku: item.sku ?? '',
      asset_id: item.asset_id ?? '',
      is_available: item.is_available,
      notes: item.notes ?? '',
      sort_order: item.sort_order,
      photos: item.photos ?? [],
    })
    setPhotoDraft('')
    setDialogOpen(true)
  }

  /**
   * Paste a Drive link, get a file id. Refuses anything else rather than
   * storing a row that renders a broken image later — the same check the asset
   * form makes, and the same reason.
   */
  function addPhoto() {
    const id = parseDriveId(photoDraft)
    if (!id) { toast.error('That does not look like a Google Drive link'); return }
    if (form.photos.includes(id)) { toast.error('That photo is already on this item'); return }
    setForm(f => ({ ...f, photos: [...f.photos, id] }))
    setPhotoDraft('')
  }

  function handleSave() {
    if (!form.name.trim()) return
    saveItem.mutate(
      {
        id: editing?.id,
        name: form.name.trim(),
        kind: form.kind as PosItem['kind'],
        // Empty means "let the name decide" — the €0 line falls back to a slug.
        sku: form.sku.trim() || null,
        asset_id: form.asset_id || null,
        is_available: form.is_available,
        notes: form.notes.trim(),
        sort_order: form.sort_order,
        photos: form.photos,
      },
      { onSuccess: () => setDialogOpen(false) },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          What we put in a box and send. A reseller does not download these — they
          ask for them, and they ride along on the next order as a €0 line.
        </p>
        {canManage && (
          <Button onClick={openNew} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Add POS item
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Package className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Nothing in the catalogue yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add a display, a wobbler or a shelf talker. Once it is here you can
              record which resellers have it, and put it on an order.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={ASSET_GRID}>
          {/* The same card grid as the downloads, for the same reason: the
              picture is the point. A name like "12 bottles (one side)" tells
              nobody what arrives in the box. Rendered off Google's CDN by the
              same helper the asset grid uses, so nobody has to open Drive. */}
          {(items ?? []).map(item => {
            const artwork = (assets ?? []).find(a => a.id === item.asset_id)
            const photo = (item.photos ?? [])[0]
            return (
              <Card
                key={item.id}
                className={`py-0 gap-0 overflow-hidden group h-full flex flex-col ${
                  item.is_available ? '' : 'opacity-60'
                }`}
              >
                <div className="relative aspect-[7/6] bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={driveThumbnail(photo)}
                      alt={item.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                      <span className="text-[10px]">No photo yet</span>
                    </div>
                  )}

                  <Badge className="absolute top-1.5 left-1.5 bg-slate-900/85 text-white text-[10px] px-1.5 py-0">
                    {posKindLabel(item.kind)}
                  </Badge>
                  {(item.photos ?? []).length > 1 && (
                    <Badge className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0">
                      {item.photos.length} photos
                    </Badge>
                  )}
                  {!item.is_available && (
                    <Badge className="absolute top-1.5 right-1.5 bg-amber-600/90 text-white text-[10px] px-1.5 py-0 gap-1">
                      <PackageX className="h-2.5 w-2.5" />
                      Out
                    </Badge>
                  )}

                  {canManage && (
                    <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(item)}
                        className="h-6 w-6 rounded-md bg-background/90 border flex items-center justify-center hover:bg-accent"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Remove "${item.name}" from the catalogue? It also disappears from every reseller's register.`)) return
                          deleteItem.mutate(item.id)
                        }}
                        className="h-6 w-6 rounded-md bg-background/90 border flex items-center justify-center hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                <CardContent className="p-2 flex-1 flex flex-col gap-0.5">
                  <p className="text-xs font-medium leading-snug line-clamp-2">{item.name}</p>
                  {artwork && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                      <Link2 className="h-2.5 w-2.5 shrink-0" />
                      {artwork.title}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{item.notes}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit POS item' : 'New POS item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. SPika stand — 12 bottles (one side)"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={v => setForm(f => ({ ...f, kind: v ?? f.kind }))}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => posKindLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {POS_KINDS.map(k => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {POS_KINDS.find(k => k.key === form.kind)?.hint}
              </p>
            </div>

            {/* Optional, and only meaningful for the ones that have a print
                file. A rack has none, which is the whole reason this catalogue
                is not part of the asset list. */}
            <div className="space-y-1.5">
              <Label>Print file <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Select
                value={form.asset_id || 'none'}
                onValueChange={v => setForm(f => ({ ...f, asset_id: !v || v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No file" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No file</SelectItem>
                  {(assets ?? []).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Photos of the finished object, not the print file. A rack has
                no artwork but does have a picture; a wobbler has both, and they
                are different things. Drive links, like everything else here. */}
            <div className="space-y-1.5">
              <Label>
                Photos{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  (what it looks like — folded, built, in a shop)
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={photoDraft}
                  onChange={e => setPhotoDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhoto() } }}
                  placeholder="Paste a Google Drive link"
                />
                <Button type="button" variant="outline" onClick={addPhoto}>Add</Button>
              </div>
              {form.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.photos.map((id, i) => (
                    <div key={id} className="relative group">
                      <a href={drivePreviewUrl(id)} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={driveThumbnail(id, 200)}
                          alt={`Photo ${i + 1}`}
                          className="h-16 w-16 rounded-md object-cover border"
                        />
                      </a>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, photos: f.photos.filter(x => x !== id) }))}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center rounded-b-md">
                          thumbnail
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {form.photos.length === 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageOff className="h-3 w-3" />
                  No photo yet — the list shows a plain box icon instead.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs font-normal">(internal)</span></Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Supplier, dimensions, anything worth remembering"
                rows={2}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-red-600"
                checked={form.is_available}
                onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))}
              />
              <span className="text-sm">
                In stock
                <span className="text-muted-foreground"> — switch off when the print run is out</span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveItem.isPending}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
