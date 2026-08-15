'use client'

import { useMemo, useState } from 'react'
import {
  Megaphone, Plus, Trash2, Pencil, Download, ExternalLink, Search,
  AlertTriangle, Lock, Image as ImageIcon, Film, FileText, Package, X, Loader2, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  useMarketingAssets, useCreateMarketingAsset, useUpdateMarketingAsset,
  useDeleteMarketingAsset, isDemoAsset,
} from '@/hooks/use-marketing-assets'
import {
  ASSET_CATEGORIES, ASSET_GRID, STANDARD_TERMS, USE_LABELS, categoryLabel, useLabel,
  parseDriveId, driveThumbnail, drivePreviewUrl, driveDownloadUrl,
} from '@/lib/marketing'
import { MarketingAsset } from '@/types'
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
import { toast } from 'sonner'

function kindIcon(kind?: string | null) {
  if (kind?.startsWith('video/')) return <Film className="h-4 w-4 text-muted-foreground shrink-0" />
  if (kind?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
  if (kind === 'application/zip') return <Package className="h-4 w-4 text-muted-foreground shrink-0" />
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
}

const EMPTY = {
  title: '', description: '', category: 'pos', use_label: 'print',
  driveInput: '', usage_terms: STANDARD_TERMS,
  visibility: 'all' as 'all' | 'staff',
  is_physical: false, physical_available: true,
}

export default function MarketingPage() {
  // Gated on the permission, not on "is this the owner" — otherwise granting it
  // to a manager on the Permissions screen would silently do nothing.
  const { can } = useAuth()
  const canManage = can('marketing.manage')
  const { data: assets, isLoading } = useMarketingAssets(true)
  const createAsset = useCreateMarketingAsset()
  const updateAsset = useUpdateMarketingAsset()
  const deleteAsset = useDeleteMarketingAsset()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MarketingAsset | null>(null)
  const [form, setForm] = useState(EMPTY)

  // Is the pasted Drive file reachable without a Google account? Her own
  // browser is signed in to Google, so a closed file looks perfect to her and
  // shows a sign-in to every reseller. Checked server-side; see the route.
  const [linkStatus, setLinkStatus] = useState<'idle' | 'checking' | 'public' | 'private' | 'unknown' | 'invalid'>('idle')
  const [linkMessage, setLinkMessage] = useState('')

  async function checkLink(input: string) {
    const id = parseDriveId(input)
    if (!id) { setLinkStatus(input.trim() ? 'invalid' : 'idle'); setLinkMessage(''); return }
    setLinkStatus('checking')
    setLinkMessage('')
    try {
      const res = await fetch('/api/marketing/check-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: id }),
      })
      const data = await res.json()
      setLinkStatus(data.status ?? 'unknown')
      setLinkMessage(data.message ?? '')
    } catch {
      setLinkStatus('unknown')
      setLinkMessage('Could not run the check.')
    }
  }

  const onDemo = (assets ?? []).some(isDemoAsset)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (assets ?? []).filter(a => {
      if (activeCategory !== 'all' && a.category !== activeCategory) return false
      if (!term) return true
      return a.title.toLowerCase().includes(term) || (a.description ?? '').toLowerCase().includes(term)
    })
  }, [assets, search, activeCategory])

  const grouped = useMemo(() => {
    const map = new Map<string, MarketingAsset[]>()
    for (const a of filtered) {
      if (!map.has(a.category)) map.set(a.category, [])
      map.get(a.category)!.push(a)
    }
    return ASSET_CATEGORIES.filter(c => map.has(c.key)).map(c => ({ ...c, items: map.get(c.key)! }))
  }, [filtered])

  function resetLinkCheck() { setLinkStatus('idle'); setLinkMessage('') }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    resetLinkCheck()
    setDialogOpen(true)
  }

  function openEdit(asset: MarketingAsset) {
    setEditing(asset)
    setForm({
      title: asset.title,
      description: asset.description ?? '',
      category: asset.category,
      use_label: asset.use_label ?? 'print',
      driveInput: asset.source === 'drive' ? asset.file_ref : '',
      usage_terms: asset.usage_terms ?? '',
      visibility: asset.visibility,
      is_physical: asset.is_physical ?? false,
      physical_available: asset.physical_available ?? true,
    })
    resetLinkCheck()
    setDialogOpen(true)
    // Re-check an asset that is already live. Sharing can be revoked in Drive
    // long after it was added, and nothing else would ever notice.
    if (asset.source === 'drive' && asset.file_ref !== 'DEMO') checkLink(asset.file_ref)
  }

  function handleSave() {
    if (!form.title.trim()) { toast.error('Give it a name a shop manager understands'); return }

    // Price material must never ride on a Drive link — that link works for
    // anyone who has it, and margins are not something you hand out that way.
    if (form.category === 'sales' && form.visibility === 'all') {
      toast.error('Sales material with prices cannot be visible to customers')
      return
    }

    const driveId = parseDriveId(form.driveInput)
    if (!driveId) { toast.error('That does not look like a Google Drive link'); return }

    // Refuse to publish something a reseller cannot open. Only blocks on a
    // CONFIRMED closed file — 'unknown' (Google unreachable) still saves, so a
    // hiccup at Google can never stop her working.
    if (linkStatus === 'private') {
      toast.error('This file is not shared yet — set it to "Anyone with the link" in Drive first')
      return
    }

    const values = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      use_label: form.use_label || null,
      source: 'drive' as const,
      file_ref: driveId,
      usage_terms: form.usage_terms.trim() || null,
      visibility: form.visibility,
      is_physical: form.is_physical,
      physical_available: form.physical_available,
    }

    if (editing) {
      updateAsset.mutate({ id: editing.id, values }, { onSuccess: () => setDialogOpen(false) })
    } else {
      createAsset.mutate(values, { onSuccess: () => setDialogOpen(false) })
    }
  }

  return (
    // Same container as every other CRM page — p-4 lg:p-6 with a centred
    // max-width. Without the lg padding this page sat tighter against the
    // sidebar than the rest of the app and read as broken.
    <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-red-600" /> Marketing
          </h1>
          <p className="text-muted-foreground text-xs">
            Everything a retailer needs to sell SPika. Customers see this in their portal.
          </p>
        </div>
        {canManage && (
          <Button onClick={openNew} size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            Add asset
          </Button>
        )}
      </div>

      {/* Demo banner — disappears by itself once migration 072 has run */}
      {onDemo && (
        <Card className="py-0 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="py-1.5 px-2.5 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Example data — nothing here is real yet.</span>{' '}
              <span className="font-normal text-amber-800 dark:text-amber-300/80">
                The <code>marketing_assets</code> table has not been created. Judge the layout, not the content.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {/* Search on its own row, like Leads and Customers. Sharing a row with
          seven chips squeezed the field down to a few pixels. */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {/* Wraps on a wide screen, scrolls sideways only on a phone — a
            scrollbar under seven chips on a desktop looked like a defect. */}
        <div className="flex gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeCategory === 'all' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            All
          </button>
          {ASSET_CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={`shrink-0 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeCategory === c.key ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className={ASSET_GRID}>
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Megaphone className="h-10 w-10 opacity-20" />
          <p className="text-sm">Nothing here yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <section key={group.key} className="space-y-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-[11px] text-muted-foreground">{group.hint}</span>
              </div>
              <div className={ASSET_GRID}>
                {group.items.map(asset => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    canManage={canManage}
                    onEdit={() => openEdit(asset)}
                    onDelete={() => {
                      if (isDemoAsset(asset)) { toast.error('Example data cannot be removed'); return }
                      deleteAsset.mutate(asset.id)
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit asset' : 'Add asset'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Google Drive link</Label>
              <Input
                placeholder="https://drive.google.com/file/d/…/view"
                value={form.driveInput}
                onChange={e => {
                  setForm(f => ({ ...f, driveInput: e.target.value }))
                  setLinkStatus('idle')
                  setLinkMessage('')
                }}
                onBlur={e => checkLink(e.target.value)}
              />

              {linkStatus === 'idle' && (
                <p className="text-[11px] text-muted-foreground">
                  Paste the share link. The file must be set to <strong>Anyone with the link</strong> in Drive,
                  otherwise a customer sees a Google sign-in instead of a download.
                </p>
              )}
              {linkStatus === 'checking' && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking whether resellers can open this…
                </p>
              )}
              {linkStatus === 'public' && (
                <p className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> Resellers can open and download this.
                </p>
              )}
              {linkStatus === 'private' && (
                <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-2 py-1.5">
                  <p className="text-[11px] text-red-800 dark:text-red-300 leading-snug">
                    <strong>Not shared.</strong> {linkMessage}
                    <br />
                    In Drive: right-click → Share → General access → <strong>Anyone with the link</strong> → Viewer.
                    Then click the field again to re-check.
                  </p>
                </div>
              )}
              {linkStatus === 'invalid' && (
                <p className="text-[11px] text-red-700 dark:text-red-400">
                  That does not look like a Google Drive link.
                </p>
              )}
              {linkStatus === 'unknown' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {linkMessage} Saving is still allowed — check it yourself in a private window.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Shelf talker — SPika Oil 100ml"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                placeholder="One line so a shop manager knows what this is."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v ?? f.category }))}>
                  {/* base-ui prints the raw value unless it is given a renderer,
                      so every Select here maps its key back to a label. */}
                  <SelectTrigger><SelectValue>{(v: string) => categoryLabel(v)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>What is it for?</Label>
                <Select value={form.use_label} onValueChange={v => setForm(f => ({ ...f, use_label: v ?? f.use_label }))}>
                  <SelectTrigger><SelectValue>{(v: string) => useLabel(v)?.label ?? v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {USE_LABELS.map(u => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Who sees it</Label>
              <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: (v as 'all' | 'staff') ?? f.visibility }))}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => (v === 'staff' ? 'Team only' : 'Customers and team')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Customers and team</SelectItem>
                  <SelectItem value="staff">Team only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Physical availability — a switch per asset, never keyed on the
                category, so a printed recipe card can be requestable too. */}
            <div className="rounded-lg border p-2.5 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-red-600"
                  checked={form.is_physical}
                  onChange={e => setForm(f => ({ ...f, is_physical: e.target.checked }))}
                />
                <span className="text-sm">
                  Resellers can ask us to send this
                  <span className="block text-[11px] text-muted-foreground font-normal">
                    Adds a &ldquo;We need this&rdquo; button in the portal. Free, goes out with their next order.
                  </span>
                </span>
              </label>

              {form.is_physical && (
                <label className="flex items-start gap-2 cursor-pointer pl-6">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-red-600"
                    checked={!form.physical_available}
                    onChange={e => setForm(f => ({ ...f, physical_available: !e.target.checked }))}
                  />
                  <span className="text-sm">
                    Temporarily out of stock
                    <span className="block text-[11px] text-muted-foreground font-normal">
                      Hides the button until the next print run.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Terms of use</Label>
              <Input
                placeholder={STANDARD_TERMS}
                value={form.usage_terms}
                onChange={e => setForm(f => ({ ...f, usage_terms: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleSave}
              disabled={createAsset.isPending || updateAsset.isPending}
            >
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AssetCard({
  asset, canManage, onEdit, onDelete,
}: {
  asset: MarketingAsset
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const label = useLabel(asset.use_label)
  const isDrive = asset.source === 'drive'
  const hasThumb = isDrive && asset.file_ref !== 'DEMO'

  return (
    // h-full + flex column so every card in a row is the same height and the
    // Download buttons line up. A one-line title next to a two-line title
    // otherwise leaves the buttons at different heights across the row.
    <Card className="py-0 overflow-hidden group h-full flex flex-col">
      {/* Preview */}
      {/* 16:10 instead of 4:3 — a shorter preview, so more assets fit on one
          screen without the thumbnail losing its shape. */}
      <div className="relative aspect-[16/10] bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- Drive's own CDN, no loader needed
          <img
            src={driveThumbnail(asset.file_ref)}
            alt={asset.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            {kindIcon(asset.file_kind)}
            <span className="text-[10px]">no preview</span>
          </div>
        )}

        {asset.visibility === 'staff' && (
          <Badge className="absolute top-1.5 left-1.5 bg-slate-900/85 text-white gap-1 text-[10px] px-1.5 py-0">
            <Lock className="h-2.5 w-2.5" />
            Team only
          </Badge>
        )}

        {canManage && (
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="h-6 w-6 rounded-md bg-background/90 border flex items-center justify-center hover:bg-accent"
              aria-label="Edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="h-6 w-6 rounded-md bg-background/90 border flex items-center justify-center hover:bg-red-50 text-red-600"
              aria-label="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <CardContent className="p-2 space-y-1 flex-1 flex flex-col">
        <div className="flex items-start gap-1">
          {kindIcon(asset.file_kind)}
          <p className="font-semibold text-[11px] leading-tight line-clamp-2 flex-1">{asset.title}</p>
        </div>

        {asset.description && (
          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{asset.description}</p>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          {label && (
            <span className={`text-[9px] px-1 py-0 rounded font-medium ${label.tone}`}>{label.label}</span>
          )}
          <span className="text-[9px] text-muted-foreground">{asset.download_count}×</span>
        </div>

        <div className="flex gap-1 pt-0.5 mt-auto">
          {isDrive && (
            <>
              <a
                href={driveDownloadUrl(asset.file_ref)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                {/* Taller on a phone, compact from sm up. At 24px these were
                    half the 44px Apple asks for and a genuine miss-tap risk.
                    Red like the portal's — it is the main action on the card
                    and an outline button disappeared against the grey. */}
                <Button size="sm" className="w-full h-9 sm:h-6 text-[11px] sm:text-[10px] gap-1 px-1 bg-red-600 hover:bg-red-700">
                  <Download className="h-3 w-3 sm:h-2.5 sm:w-2.5" />
                  Download
                </Button>
              </a>
              <a href={drivePreviewUrl(asset.file_ref)} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="h-9 w-9 sm:h-6 sm:w-6 p-0 shrink-0" aria-label="Open in Drive">
                  <ExternalLink className="h-3 w-3 sm:h-2.5 sm:w-2.5" />
                </Button>
              </a>
            </>
          )}
          {!isDrive && (
            <Button size="sm" variant="outline" disabled className="w-full h-9 sm:h-6 text-[11px] sm:text-[10px] gap-1 px-1">
              <Lock className="h-3 w-3 sm:h-2.5 sm:w-2.5" />
              Stored file
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
