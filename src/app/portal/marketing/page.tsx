'use client'

import { useMemo, useState } from 'react'
import { Megaphone, Download, Loader2, AlertTriangle, Film, Image as ImageIcon, FileText, Package, PackagePlus, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMarketingAssets, useTrackDownload, isDemoAsset } from '@/hooks/use-marketing-assets'
import { useCreatePosRequest } from '@/hooks/use-pos-requests'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ASSET_CATEGORIES, ASSET_GRID, STANDARD_TERMS, useLabel, driveThumbnail, driveDownloadUrl } from '@/lib/marketing'
import { MarketingAsset } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function kindIcon(kind?: string | null) {
  if (kind?.startsWith('video/')) return <Film className="h-4 w-4 text-muted-foreground shrink-0" />
  if (kind?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
  if (kind === 'application/zip') return <Package className="h-4 w-4 text-muted-foreground shrink-0" />
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
}

export default function PortalMarketingPage() {
  // `false` = portal view. Staff-only rows never reach the customer.
  const { data: assets, isLoading } = useMarketingAssets(false)
  const trackDownload = useTrackDownload()
  const { profile } = useAuth()
  const createRequest = useCreatePosRequest()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [requesting, setRequesting] = useState<MarketingAsset | null>(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  function closeRequest() {
    setRequesting(null)
    setQty(1)
    setNote('')
  }

  function submitRequest() {
    if (!requesting || !profile?.customer_id) return
    createRequest.mutate(
      { customer_id: profile.customer_id, asset_id: requesting.id, qty, note: note.trim() || undefined },
      { onSuccess: closeRequest }
    )
  }

  const onDemo = (assets ?? []).some(isDemoAsset)

  const categoriesInUse = useMemo(
    () => ASSET_CATEGORIES.filter(c => (assets ?? []).some(a => a.category === c.key)),
    [assets]
  )

  const visible = useMemo(
    () => (assets ?? []).filter(a => activeCategory === 'all' || a.category === activeCategory),
    [assets, activeCategory]
  )

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Marketing</h1>
        <p className="text-muted-foreground text-xs">
          Photos, shelf material and clips to use in your store and on social. Free to use.
        </p>
      </div>

      {onDemo && (
        <Card className="py-0 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="py-2.5 px-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 dark:text-amber-200">
              Example data — this is the layout, not the real material yet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Category chips */}
      {categoriesInUse.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 px-3 py-2 sm:px-2.5 sm:py-1 rounded-md text-xs font-medium transition-colors ${
              activeCategory === 'all' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            All
          </button>
          {categoriesInUse.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={`shrink-0 px-3 py-2 sm:px-2.5 sm:py-1 rounded-md text-xs font-medium transition-colors ${
                activeCategory === c.key ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <Megaphone className="h-10 w-10 opacity-20" />
          <p className="text-sm">No material here yet.</p>
        </div>
      ) : (
        <div className={ASSET_GRID}>
          {visible.map(asset => (
            <PortalAssetCard
              key={asset.id}
              asset={asset}
              onDownload={() => trackDownload(asset.id)}
              onRequest={setRequesting}
            />
          ))}
        </div>
      )}

      <Card className="py-0 border-dashed">
        <CardContent className="py-3 px-3 space-y-1">
          <p className="text-xs leading-snug">{STANDARD_TERMS}</p>
          <p className="text-xs text-muted-foreground leading-snug">
            Missing something, or need a different size? Let us know and we&apos;ll add it.
          </p>
        </CardContent>
      </Card>

      {/* Request sheet — slides up from the bottom, because this is a phone in a
          shop and the thumb is already down there. */}
      {requesting && (
        <>
          {/* z-60 and a bottom nav's worth of padding: the portal's own nav bar
              is fixed at z-50, and without both the Send button sat behind it. */}
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={closeRequest} />
          <div className="fixed bottom-0 left-0 right-0 z-[60] bg-background border-t rounded-t-2xl p-4 pb-6 space-y-3 max-w-2xl mx-auto max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">Ask us to send this</p>
                <p className="text-xs text-muted-foreground leading-snug">{requesting.title}</p>
              </div>
              <button onClick={closeRequest} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs leading-snug">
                POS material is <span className="font-semibold">free</span>{' '}
                for our resellers. We&apos;ll send it with your next order.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">How many do you need?</Label>
              <Input
                type="number"
                min="1"
                inputMode="numeric"
                className="h-10 w-28"
                value={qty}
                onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Anything we should know?</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="For example: for two locations, or which shelf it is for."
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 h-11 bg-red-600 hover:bg-red-700"
                disabled={createRequest.isPending}
                onClick={submitRequest}
              >
                {createRequest.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Send request
              </Button>
              <Button variant="outline" className="h-11" onClick={closeRequest}>Cancel</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PortalAssetCard({ asset, onDownload, onRequest }: {
  asset: MarketingAsset
  onDownload: () => void
  onRequest: (asset: MarketingAsset) => void
}) {
  const label = useLabel(asset.use_label)
  const hasThumb = asset.source === 'drive' && asset.file_ref !== 'DEMO'

  return (
    // Equal height per row so the Download buttons line up — titles run to one
    // or two lines and would otherwise leave the buttons stepped.
    <Card className="py-0 overflow-hidden h-full flex flex-col">
      {/* Same 16:10 as the CRM tab — shorter preview, more assets per screen. */}
      <div className="relative aspect-[16/10] bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by Drive's CDN
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
      </div>

      <CardContent className="p-1.5 space-y-1 flex-1 flex flex-col">
        <p className="font-semibold text-[11px] leading-tight line-clamp-2">{asset.title}</p>

        {/* The use label describes the FILE ("For print", "For Instagram").
            On a physical asset the reseller never gets the file — we print it
            and ship it — so "For print" there would read as an instruction to
            print it themselves. It says what we send instead. */}
        {asset.is_physical ? (
          <span className="inline-block text-[9px] px-1 py-0 rounded font-medium w-fit bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
            We send this to you
          </span>
        ) : label && (
          <span className={`inline-block text-[9px] px-1 py-0 rounded font-medium w-fit ${label.tone}`}>
            {label.label}
          </span>
        )}

        {/* Only shown when this asset has its OWN terms. The standard line is
            identical on nearly every asset, and repeating it truncated on each
            card was 33 lines of noise that nobody could finish reading. It is
            stated once, in full, at the bottom of the page. */}
        {asset.usage_terms && asset.usage_terms !== STANDARD_TERMS && (
          <p className="text-[9px] text-muted-foreground leading-snug line-clamp-2">{asset.usage_terms}</p>
        )}

        {/* One action per card, never two.
            A shelf talker is a thing we print and ship — a reseller has no use
            for the PDF, so a physical asset REPLACES Download with "We need
            this" rather than adding a button next to it. Downloadable assets
            (photos, clips) keep Download. Staff still reach the file from the
            CRM tab, which is where it goes to the printer from. */}
        <div className="mt-auto pt-0.5">
          {asset.is_physical ? (
            asset.physical_available ? (
              <Button
                size="sm"
                onClick={() => onRequest(asset)}
                className="w-full h-10 sm:h-6 text-xs sm:text-[10px] gap-1 px-1 bg-red-600 hover:bg-red-700"
              >
                <PackagePlus className="h-3 w-3" />
                We need this
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="w-full h-10 sm:h-6 text-xs sm:text-[10px] gap-1 px-1"
              >
                Out of stock
              </Button>
            )
          ) : (
            /* Straight to Google — full resolution, nothing through the app. */
            <a
              href={driveDownloadUrl(asset.file_ref)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDownload}
            >
              {/* Used on a phone in a shop, so a full 40px tap target there. */}
              <Button size="sm" className="w-full h-10 sm:h-6 text-xs sm:text-[10px] gap-1 px-1 bg-red-600 hover:bg-red-700">
                <Download className="h-3 w-3" />
                Download
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
