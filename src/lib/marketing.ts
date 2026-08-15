// Marketing assets — the one place that knows how a Drive file becomes a
// thumbnail, a preview and a download.
//
// WHY DRIVE AND NOT A BUCKET: retailers need the ORIGINAL, in full resolution.
// A shelf talker at screen resolution is worthless to a shop that prints it.
// Google Drive has no short-lived signed link (unlike Supabase Storage or R2),
// so there are only two modes: "restricted" — which forces every retailer to
// own a Google account and accept an invite — or "anyone with the link", which
// needs nothing at all. We use the second, and the CRM is the only place those
// links are ever shown. Unguessable, not secret.
//
// Anything that must be genuinely secret (price lists, margins) does NOT belong
// on a Drive link. Those carry source 'storage' and live in Supabase behind the
// portal login, where access is enforced per user.

/**
 * The asset grid, shared by the CRM tab and the portal.
 *
 * auto-fill measures the CONTAINER, not the viewport, and that is the point.
 * Breakpoint columns (`lg:grid-cols-5`) key off the window, so in a narrow
 * preview pane — or any layout where the content column is much narrower than
 * the window — a row that should hold six cards showed three and left half the
 * row empty. auto-fill simply fits as many 140px cards as there is room for.
 */
export const ASSET_GRID = 'grid [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))] gap-2'

/** The default terms, pre-filled on the add form and stated once in the portal. */
export const STANDARD_TERMS = 'For SPika promotion only — do not alter the logo.'

/**
 * POS requests — a reseller asking for the PHYSICAL version of an asset.
 *
 * Deliberately NOT keyed on the category. Shelf talkers are the obvious case,
 * but a printed recipe card is just as physical, and hard-wiring this to
 * `category === 'pos'` would mean rebuilding the moment she has those printed.
 * It is a switch per asset instead, so she decides.
 *
 * open     — the reseller asked, nobody has looked yet
 * planned  — put on an order, going out with the next delivery
 * sent     — that order was delivered
 * declined — with a reason, e.g. the print run is out
 */
export const POS_STATUSES = ['open', 'planned', 'sent', 'declined'] as const
export type PosStatus = (typeof POS_STATUSES)[number]

export const POS_STATUS_LABELS: Record<PosStatus, string> = {
  open: 'Open',
  planned: 'On the next order',
  sent: 'Sent',
  declined: 'Declined',
}

export const POS_STATUS_TONES: Record<PosStatus, string> = {
  open:     'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  planned:  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  sent:     'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

/**
 * The order line a granted request becomes.
 *
 * Priced at zero on purpose: POS material is free for resellers, and her rule
 * is that it shows on the invoice so the shop has proof it was included. A zero
 * line cannot move revenue (that reads `orders.total`) and cannot touch the
 * bottle count (the stock page only counts OIL_SKUS), so this rides along
 * without disturbing a single existing figure.
 */
export function posOrderLine(assetTitle: string, qty: number) {
  return {
    sku: `pos-${slugForSku(assetTitle)}`,
    name: `${assetTitle} (POS material)`,
    qty,
    unit_price: 0,
    discount: 0,
    line_total: 0,
  }
}

function slugForSku(title: string) {
  return title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40)
}

export type AssetSource = 'drive' | 'storage'

/** Who may see an asset. Kept deliberately coarse — one switch, no matrix. */
export type AssetVisibility = 'all' | 'staff'

/**
 * The split that matters is WHO PRINTS IT, not what the thing is.
 *
 * A shelf talker looked like POS material, but every reseller already owns a
 * shelf-card printer — sending them one is slower than letting them print it.
 * So `prints` is everything they run off themselves (Download), and `pos` is
 * only what we have printed and ship (We need this). Same artwork, different
 * logistics, and the reseller should never have to work out which.
 */
export const ASSET_CATEGORIES = [
  { key: 'prints',       label: 'Printables',          hint: 'Print it yourself — shelf cards, posters, flyers' },
  { key: 'pos',          label: 'POS material',        hint: 'We print and ship it — wobblers, table tents, displays' },
  { key: 'photos',       label: 'Product photos',      hint: 'Pack shots, mood and lifestyle photography' },
  { key: 'clips',        label: 'Clips',               hint: 'Short video for social, explainers, recipes' },
  { key: 'brand',        label: 'Logos & brand',       hint: 'Logo variants, colours, do and do-not' },
  { key: 'recipes',      label: 'Recipes & usage',     hint: 'Recipe cards and serving tips' },
  { key: 'sales',        label: 'Sales material',      hint: 'Sell sheets and price lists — staff only' },
  { key: 'specs',        label: 'Certificates & specs', hint: 'Ingredients, shelf life, allergens' },
] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]['key']

/**
 * Labelled by USE, not by format.
 *
 * A shop manager does not know whether they need a 4000px JPG or a 1080px one.
 * They know they are printing a sign, or posting a story. Getting this wrong is
 * how a blurry shelf talker ends up in a store with our name on it.
 */
export const USE_LABELS = [
  { key: 'print',    label: 'For print',    tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  { key: 'social',   label: 'For Instagram', tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200'   },
  { key: 'whatsapp', label: 'For WhatsApp',  tone: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200' },
  { key: 'share',    label: 'To forward',    tone: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'       },
] as const

export type UseLabel = (typeof USE_LABELS)[number]['key']

export function categoryLabel(key: string): string {
  return ASSET_CATEGORIES.find(c => c.key === key)?.label ?? key
}

export function useLabel(key: string | null | undefined) {
  return USE_LABELS.find(u => u.key === key)
}

/**
 * Pull the file id out of whatever Google hands you when you press Share.
 *
 * She will paste a full URL, not an id, and Drive has four shapes of URL in
 * circulation. Returns null when it is not a Drive link at all, so the form can
 * say so instead of storing a broken row.
 */
export function parseDriveId(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  // Already a bare id: Drive ids are long, no slashes, no spaces.
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value

  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{20,})/,   // /file/d/<id>/view
    /[?&]id=([A-Za-z0-9_-]{20,})/,       // /open?id=<id>, /uc?id=<id>
    /\/d\/([A-Za-z0-9_-]{20,})/,         // /document/d/<id>, /presentation/d/<id>
  ]
  for (const re of patterns) {
    const m = value.match(re)
    if (m) return m[1]
  }
  return null
}

/**
 * Drive renders its own thumbnails, so we store none and generate none.
 *
 * That is the whole reason the grid stays light: a 400px thumbnail is a few
 * dozen kB and comes off Google's CDN, never out of our own storage quota.
 */
export function driveThumbnail(fileId: string, width = 400): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
}

/** Opens Drive's own viewer — used for "look at it first" on clips and PDFs. */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

/**
 * The download itself goes straight from Google to the retailer — full speed,
 * full resolution, nothing routed through Vercel.
 */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}
