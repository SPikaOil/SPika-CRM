import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MarketingAsset } from '@/types'
import { STANDARD_TERMS } from '@/lib/marketing'
import { toast } from 'sonner'

/**
 * PREVIEW ONLY — remove together with `usingDemoData` once migration 072 has run.
 *
 * The screens are built before the table exists, on purpose: they get checked
 * first and the migration follows. Until then every query below falls back to
 * these rows so the grid can actually be judged. The banner on both screens
 * says out loud that this is not real data.
 */
type DemoSeed = [
  category: string,
  title: string,
  description: string,
  use: string | null,
  kind: string,
  downloads: number,
]

const DEMO_SEEDS: DemoSeed[] = [
  // Printables — they run these off themselves. Every reseller already has a
  // shelf-card printer, so shipping them a shelf talker is slower than letting
  // them print one. Sizes belong in the TITLE: a shop manager decides by size.
  ['prints', 'Shelf card — SPika Oil 100ml', 'Fits a standard shelf rail. Print on card.', 'print', 'application/pdf', 12],
  ['prints', 'Shelf card — SPika Oil 50ml', 'Same layout, other format.', 'print', 'application/pdf', 8],
  ['prints', 'Shelf card — SPika2Go', 'For the impulse spot at the register.', 'print', 'application/pdf', 5],
  ['prints', 'Price card — blank', 'Our design, your price.', 'print', 'application/pdf', 6],
  ['prints', 'Shelf strip — 60cm', 'Runs along the shelf edge. Print and cut.', 'print', 'application/pdf', 2],
  ['prints', 'Poster A4 — Taste the island', 'Behind the counter or on the door.', 'print', 'application/pdf', 9],
  ['prints', 'Window sign — Sold here', 'A4, prints on any office printer.', 'print', 'application/pdf', 11],
  ['prints', 'Tasting day sign — A4', 'For a sampling table.', 'print', 'application/pdf', 1],
  ['prints', 'New in store — burst', 'Small flash to stick on the shelf card.', 'print', 'application/pdf', 4],
  ['prints', 'QR poster — recipes', 'Scans through to the recipe page.', 'print', 'application/pdf', 3],
  ['prints', 'Staff one-pager — sell SPika in 30 seconds', 'For behind the counter, not for customers.', 'share', 'application/pdf', 7],
  ['prints', 'Shelf placement guide', 'Where the product works best on the shelf.', 'share', 'application/pdf', 2],
  ['prints', 'Seasonal — Carnival poster A4', 'Same poster, carnival jacket.', 'print', 'application/pdf', 6],

  // POS material — only what WE have printed and ship. Materials a shop cannot
  // produce: die-cut, plastic, thick board.
  ['pos', 'Wobbler — round, 8cm', 'Die-cut on plastic, springs off the shelf edge.', null, 'application/pdf', 4],
  ['pos', 'Table tent — restaurants', 'Two-sided on thick board, stands up.', null, 'application/pdf', 7],
  ['pos', 'Counter display — 6 bottles', 'Cardboard display for next to the register.', null, 'application/pdf', 3],
  ['pos', 'Window sticker — vinyl', 'Cut vinyl, sticks on the inside of the glass.', null, 'application/pdf', 5],

  ['photos', 'Pack shot — 100ml on white', 'Clean pack shot, transparent background on request.', 'print', 'image/jpeg', 31],
  ['photos', 'Pack shot — full range together', 'All five formats in one frame.', 'social', 'image/jpeg', 22],
  ['photos', 'Mood — bottle on a table, evening light', 'Warm, works well as a background.', 'whatsapp', 'image/jpeg', 17],
  ['photos', 'Pack shot — 50ml on white', 'Same treatment as the 100ml.', 'print', 'image/jpeg', 14],
  ['photos', 'Pack shot — SPika2Go 5ml', 'The pocket format, close up.', 'social', 'image/jpeg', 8],
  ['photos', 'Mood — drizzle over grilled fish', 'The product in use.', 'social', 'image/jpeg', 26],
  ['photos', 'Mood — bottle in the shelf', 'Shows how it sits in a store.', 'whatsapp', 'image/jpeg', 5],
  ['photos', 'Flat lay — range with ingredients', 'Peppers and herbs around the bottles.', 'social', 'image/jpeg', 19],

  ['clips', 'Clip — drizzle over fresh fish', '9:16, 12 seconds, no audio needed.', 'social', 'video/mp4', 8],
  ['clips', 'Clip — how much is one drop', '9:16, 8 seconds. Good for a story.', 'whatsapp', 'video/mp4', 6],
  ['clips', 'Clip — the story behind SPika', '16:9, 45 seconds, with subtitles.', 'share', 'video/mp4', 3],
  ['clips', 'Clip — three ways to use it', '9:16, 20 seconds.', 'social', 'video/mp4', 12],
  ['clips', 'Clip — unboxing a case', '9:16, 15 seconds. For retailers.', 'social', 'video/mp4', 2],

  ['brand', 'SPika logo pack', 'Full colour, white and black. PNG and SVG.', 'share', 'application/zip', 5],
  ['brand', 'Brand colours & fonts', 'One sheet with the exact values.', 'share', 'application/pdf', 4],
  ['brand', 'Logo — do and do-not', 'What not to do with the logo.', 'share', 'application/pdf', 3],

  ['recipes', 'Recipe card — SPika mayo', 'Something to hand out at a tasting.', 'whatsapp', 'image/jpeg', 2],
  ['recipes', 'Recipe card — grilled corn', 'Quick, works on a market stall.', 'whatsapp', 'image/jpeg', 6],
  ['recipes', 'Recipe card — pasta aglio e olio', 'Simple, with the 100ml.', 'social', 'image/jpeg', 9],
  ['recipes', 'Serving tips — one pager', 'Five ideas a shop can suggest.', 'share', 'application/pdf', 7],

  ['specs', 'Product sheet — ingredients & shelf life', 'What a buyer asks for before listing you.', 'share', 'application/pdf', 3],
  ['specs', 'Allergen statement', 'Signed, current year.', 'share', 'application/pdf', 5],
  ['specs', 'Barcode & packaging data', 'EAN, case count, dimensions.', 'share', 'application/pdf', 4],
]

const DEMO_ASSETS: MarketingAsset[] = [
  ...DEMO_SEEDS.map(([category, title, description, use, kind, downloads], i) => ({
    id: `demo-${i + 1}`, created_at: '', updated_at: '',
    title, description, category, use_label: use,
    source: 'drive' as const, file_ref: 'DEMO', file_kind: kind,
    usage_terms: STANDARD_TERMS,
    visibility: 'all' as const, sort_order: i + 1, is_active: true, download_count: downloads,
    // POS material is the physical case; the rest is download-only.
    is_physical: category === 'pos', physical_available: true,
  })),
  // One REAL Drive file, so the preview shows an actual Google thumbnail
  // instead of a grey box. Verified reachable without a Google account.
  // Goes away with the rest of the demo data once migration 072 has run.
  {
    id: 'demo-real-1', created_at: '', updated_at: '',
    title: 'Clip — What is Curaçao for you (part 2)',
    description: 'Real file from the Drive folder — this is what a live thumbnail looks like.',
    category: 'clips', use_label: 'share', source: 'drive',
    file_ref: '1N0pKljOsvasCoWSq41mt44xWufOfXhON', file_kind: 'video/quicktime',
    usage_terms: STANDARD_TERMS,
    visibility: 'all', sort_order: 20, is_active: true, download_count: 0,
    is_physical: false, physical_available: true,
  },
  // The one staff-only example: price material never rides on a Drive link.
  {
    id: 'demo-sales-1', created_at: '', updated_at: '',
    title: 'Sell sheet 2026 — with trade prices', description: 'Internal. Never share a Drive link for this one.',
    category: 'sales', use_label: null, source: 'storage', file_ref: 'marketing/sell-sheet-2026.pdf',
    file_kind: 'application/pdf', usage_terms: null,
    visibility: 'staff', sort_order: 90, is_active: true, download_count: 0, is_physical: false, physical_available: true,
  },
  {
    id: 'demo-sales-2', created_at: '', updated_at: '',
    title: 'Trade price list — Q3 2026', description: 'Internal only.',
    category: 'sales', use_label: null, source: 'storage', file_ref: 'marketing/prices-q3-2026.pdf',
    file_kind: 'application/pdf', usage_terms: null,
    visibility: 'staff', sort_order: 91, is_active: true, download_count: 0, is_physical: false, physical_available: true,
  },
]

/** True while the screens are running on DEMO_ASSETS because the table is absent. */
export function isDemoAsset(asset: MarketingAsset) {
  return asset.id.startsWith('demo-')
}

/**
 * PostgREST answers a missing table with PGRST205 ("Could not find the table
 * … in the schema cache"), NOT with Postgres' own 42P01 — verified against the
 * live project. Both are accepted so a direct SQL path would work too.
 */
function tableMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return /marketing_assets/i.test(msg) && /does not exist|not find/i.test(msg)
}

/**
 * @param staffView  true for the CRM tab (sees everything), false for the
 *                   portal (never sees `visibility: 'staff'` rows).
 */
export function useMarketingAssets(staffView: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['marketing-assets', staffView],
    queryFn: async () => {
      let query = supabase
        .from('marketing_assets')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      // No visibility filter for the portal any more. Since migration 085 an
      // asset can be aimed at named resellers or follow a campaign, and only
      // the database knows which of those apply to THIS login. Filtering here
      // for visibility = all would hide exactly the material we just built the
      // aiming for. The staff view still asks for everything; the read policy
      // decides what comes back.

      const { data, error } = await query
      if (error) {
        if (tableMissing(error)) {
          return DEMO_ASSETS.filter(a => staffView || a.visibility === 'all')
        }
        throw error
      }
      return data as MarketingAsset[]
    },
  })
}

export function useCreateMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<MarketingAsset>) => {
      const { data, error } = await supabase
        .from('marketing_assets')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as MarketingAsset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<MarketingAsset> }) => {
      const { error } = await supabase.from('marketing_assets').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Soft delete. An asset that was pulled back is still referenced by whoever
 * already downloaded it, and the download count is worth keeping.
 */
export function useDeleteMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_assets').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Counts a download. Deliberately fire-and-forget on the CLIENT — this runs in
 * the browser next to a link the user already clicked, so a failed count must
 * never hold up or break their download. Not a server route: see AGENTS note in
 * the migration about why this uses a SECURITY DEFINER function.
 */
export function useTrackDownload() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return async (assetId: string) => {
    if (assetId.startsWith('demo-')) return
    const { error } = await supabase.rpc('bump_marketing_download', { asset_id: assetId })
    if (!error) queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
  }
}

/**
 * Which resellers each asset is aimed at, in one query rather than one per card.
 *
 * A reseller reading this gets only the rows that name THEM — the policy on
 * marketing_asset_customers says so — which is enough for the portal to mark a
 * card "for you" without ever showing who else is on the list.
 */
export function useAssetAudiences() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['marketing-asset-audiences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_asset_customers')
        .select('asset_id, customer_id')
      // The table only exists after migration 085. Until then every asset is
      // simply aimed at everyone, which is what the app did before.
      if (error) return {} as Record<string, string[]>
      const map: Record<string, string[]> = {}
      for (const row of data ?? []) {
        (map[row.asset_id] ??= []).push(row.customer_id)
      }
      return map
    },
  })
}

/**
 * Replace an asset's audience. A replace and not a merge: what is ticked in the
 * form IS the audience, so unticking somebody has to take them off the list.
 */
export function useSaveAssetAudience() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, customerIds, visibility }: {
      assetId: string; customerIds: string[]; visibility: string
    }) => {
      await supabase.from('marketing_asset_customers').delete().eq('asset_id', assetId)
      if (visibility !== 'selected' || customerIds.length === 0) return
      const { error } = await supabase
        .from('marketing_asset_customers')
        .insert(customerIds.map(customer_id => ({ asset_id: assetId, customer_id })))
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-asset-audiences'] })
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
    },
  })
}
