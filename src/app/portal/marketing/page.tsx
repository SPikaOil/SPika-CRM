'use client'

import { useMemo, useState } from 'react'
import { Megaphone, Download, Loader2, Film, Image as ImageIcon, FileText, Package, PackagePlus, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMarketingAssets, useTrackDownload } from '@/hooks/use-marketing-assets'
import { useCreatePosRequest } from '@/hooks/use-pos-requests'
import { usePosItems, type PosItem } from '@/hooks/use-pos-items'
import { posKindLabel } from '@/lib/pos'
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
  /**
   * What a reseller can ask us to send: the CATALOGUE, and nothing else.
   *
   * Her GO of 2026-08-19. It used to read marketing_assets.is_physical, which
   * is a different list from the one the warehouse ships out of — measured on
   * the day, zero assets carried that flag while the catalogue held six items,
   * so the button appeared nowhere and the six stands could not be asked for.
   */
  const { data: catalogue } = usePosItems()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [requesting, setRequesting] = useState<PosItem | null>(null)
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
      {
        customer_id: profile.customer_id,
        pos_item_id: requesting.id,
        qty,
        note: note.trim() || undefined,
        // Carried for the admin e-mail only — not stored on the row.
        customerName: profile.name || undefined,
        assetTitle: requesting.name,
        outOfStock: !requesting.is_available,
      },
      { onSuccess: closeRequest }
    )
  }

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
            />
          ))}
        </div>
      )}

      {/* The catalogue: things we physically send, not files to download.
          Its own block, because "ask us to send this" and "download this" are
          two different actions and a card can only carry one of them. */}
      {(catalogue ?? []).length > 0 && (
        <div className="space-y-2 pt-2">
          <div>
            <h2 className="text-sm font-semibold">Shelf material we send you</h2>
            <p className="text-xs text-muted-foreground">
              Free for our resellers. Ask, and it goes out with your next order.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {(catalogue ?? []).map(item => (
              <Card key={item.id} className="py-0 overflow-hidden">
                <CardContent className="p-2.5 flex flex-col gap-1.5 h-full">
                  <div className="flex items-start gap-1.5">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="font-semibold text-[11px] leading-tight">{item.name}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{posKindLabel(item.kind)}</p>
                  {!item.is_available && (
                    <span className="text-[9px] px-1 py-0 rounded font-medium self-start bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Out of stock — ask anyway
                    </span>
                  )}
                  <div className="mt-auto pt-1">
                    <Button
                      size="sm"
                      onClick={() => setRequesting(item)}
                      className="w-full h-10 sm:h-6 text-xs sm:text-[10px] gap-1 px-1 bg-red-600 hover:bg-red-700"
                    >
                      <PackagePlus className="h-3 w-3" />
                      We need this
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
                <p className="text-xs text-muted-foreground leading-snug">{requesting.name}</p>
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

            {/* Said plainly rather than hiding the button: they still get to
                ask, they just know it will not be on the very next delivery. */}
            {!requesting.is_available && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2">
                <p className="text-xs leading-snug text-amber-900 dark:text-amber-200">
                  We&apos;re out of this one right now. Send your request anyway — we&apos;ll
                  put it aside for you and it goes out as soon as we have it again.
                </p>
              </div>
            )}

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

/**
 * One downloadable asset. Download and nothing else.
 *
 * The "We need this" button used to live here too, on any asset flagged
 * physical. Asking for something to be SENT now goes through the catalogue
 * block above, which is the list the warehouse actually ships from — her GO of
 * 2026-08-19. This card is back to one job.
 */
function PortalAssetCard({ asset, onDownload }: {
  asset: MarketingAsset
  onDownload: () => void
}) {
  const label = useLabel(asset.use_label)
  const hasThumb = asset.source === 'drive' && asset.file_ref !== 'DEMO'

  return (
    // Equal height per row so the Download buttons line up — titles run to one
    // or two lines and would otherwise leave the buttons stepped.
    /* gap-0 as well as py-0 — see the note on the CRM card: the component's
       built-in gap-4 left the white block top-heavy. */
    <Card className="py-0 gap-0 overflow-hidden h-full flex flex-col">
      {/* Same 7:6 as the CRM tab, with the label on the image for the same
          reason: it buys the picture a whole text line at no cost in height. */}
      <div className="relative aspect-[7/6] bg-muted flex items-center justify-center overflow-hidden shrink-0">
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

      {/* The use label describes the FILE ("For print", "For Socials"). On a
          physical asset the reseller never gets the file — we print it and ship
          it — so "For print" there would read as an instruction to print it
          themselves. It says what we send instead. Rendered over the image. */}
      {/* Centred like the CRM tab: title and label on the middle line of the
          white block instead of against the left edge. */}
      {/* Same as the CRM tab: the label reads as an eyebrow above the title. */}
      <CardContent className="px-1.5 pt-1 pb-1 flex-1 flex flex-col items-center text-center">
        {/* Label hard left like the CRM card; there is no count on this side. */}
        <div className="flex items-center justify-start w-full">
          {label && (
            <span className={`text-[9px] px-1 py-0 rounded font-medium ${label.tone}`}>
              {label.label}
            </span>
          )}
        </div>

        <p className="font-semibold text-[11px] leading-tight line-clamp-2 mt-0.5">{asset.title}</p>

        {/* Only shown when this asset has its OWN terms. The standard line is
            identical on nearly every asset, and repeating it truncated on each
            card was 33 lines of noise that nobody could finish reading. It is
            stated once, in full, at the bottom of the page. */}
        {asset.usage_terms && asset.usage_terms !== STANDARD_TERMS && (
          <p className="text-[9px] text-muted-foreground leading-snug line-clamp-2">{asset.usage_terms}</p>
        )}

        {/* Straight to Google — full resolution, nothing through the app. */}
        <div className="mt-auto pt-1.5 w-full">
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
        </div>
      </CardContent>
    </Card>
  )
}
