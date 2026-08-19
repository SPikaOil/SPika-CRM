export type UserRole = 'admin' | 'manager' | 'sales' | 'warehouse' | 'marketing' | 'staff' | 'customer' | 'prospect'

export type CustomerCategory = string

export type LeadStage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'

export type OrderStatus =
  | 'pending_approval'
  | 'processing'
  | 'out_for_delivery'
  /** Some of the order has arrived and been signed for, but not all of it. */
  | 'partly_delivered'
  | 'delivered'
  | 'invoice_ready'
  | 'invoice_blocked'
  | 'paid'
  | 'deleted'

export type PodType = 'signature' | 'photo'

export type PreferredCommunication = 'whatsapp' | 'email' | 'phone'

export type CustomerStatus = 'active' | 'inactive'

export interface Address {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export interface QuoteItem {
  sku: string
  name: string
  qty: number
  unit_price: number
  discount: number
  line_total: number
  tht_date?: string
}

export interface GpsLocation {
  lat: number
  lng: number
  accuracy: number
}

export interface User {
  id: string
  email: string
  role: UserRole
  name: string
  phone: string
  customer_id: string | null
  is_active: boolean
  created_at: string
  /** Admin requires two-step verification on this account (migration 075). */
  mfa_required?: boolean
  /** Filled in by /api/admin/users from the auth side — see TeamMemberExtras. */
  has_2fa?: boolean
  last_sign_in_at?: string | null
  blocked?: boolean
}

export interface SpikaStand {
  type: '4-single' | '8-single' | '10-double' | '12-single' | '16-double' | '24-single'
  qty: number
}

export const SPIKA_STAND_TYPES: { value: SpikaStand['type']; label: string; capacity: number }[] = [
  { value: '4-single',  label: '4 btls (one side)',              capacity: 4  },
  { value: '8-single',  label: '8 btls (one side)',              capacity: 8  },
  { value: '10-double', label: '10 btls (two sides - 5 each)',   capacity: 10 },
  { value: '12-single', label: '12 btls (one side)',             capacity: 12 },
  { value: '16-double', label: '16 btls (two sides - 8 each)',   capacity: 16 },
  { value: '24-single', label: '24 btls (one side)',             capacity: 24 },
]

export interface ContactLogEntry {
  id: string
  contacted_at: string        // date of the touchpoint (YYYY-MM-DD)
  contacted_by: string        // who we spoke to (person at the customer)
  channel: string             // whatsapp | phone | visit | email | other
  note: string
  logged_by?: string          // our user id who recorded it
  created_at: string          // when the entry was recorded
}

export interface Customer {
  id: string
  // A lead is a potential customer we haven't sold to yet. Convert = is_lead → false.
  is_lead: boolean
  // Touchpoints (who/when/note) — available on every customer, not only leads.
  contact_log: ContactLogEntry[]
  // 'S-0001' — auto-assigned by DB trigger (migration 039); null pre-migration
  customer_number?: string | null
  company_name: string
  // Chosen at customer creation. Decides which price categories may be
  // attached, and is stamped onto every order this customer places (051).
  currency: OrderCurrency
  customer_category: CustomerCategory
  contact_person: string
  phone: string
  whatsapp: string
  email: string
  billing_emails: string[]
  billing_address: Address
  delivery_address: Address
  delivery_days: string[]
  delivery_time_window: string
  ob_form_required: boolean
  ob_form_signed: boolean
  ob_form_signed_at: string | null
  ob_form_signer_name: string | null
  ob_form_signed_url: string | null
  packing_slip_required: boolean
  discount_agreement: string
  track_table_bottles: boolean
  table_count: number | null
  table_bottle_interval_weeks: number | null
  hardcopy_required: boolean
  require_delivery_photo: boolean
  preferred_communication: PreferredCommunication
  language: string
  internal_notes: string
  quickbooks_customer_id: string
  /**
   * The person at SPika this reseller belongs to (users.id), shown to them in
   * the portal on Support. Null means nobody is assigned and their portal falls
   * back to the general contact details.
   */
  assigned_to: string | null
  vat_number: string
  coc_number: string
  crib_number: string
  /**
   * @deprecated Do not read this to decide anything. Since 2026-08-15 an order
   * is an export because the delivery country is not Curaçao — use
   * isExportCustomer() from lib/country.ts. The column is left in place so old
   * rows keep their value, but a hand-set switch and an address will drift, and
   * this one already did.
   */
  is_international: boolean
  product_prices: Record<string, number>
  product_discounts: Record<string, number>
  free_products: string[]
  active_products: string[]
  table_bottle_return_price: number
  payment_term_days: number
  /**
   * @deprecated since migration 088. The racks live in customer_pos_items now,
   * together with the rest of the POS material. The column is kept so the
   * carry-over of 28 racks across 14 resellers stays checkable, and so
   * nothing that still reads it breaks — same treatment as is_international.
   */
  spika_stands: SpikaStand[]
  status: CustomerStatus
  // Consignment customer: goods stay SPika's until the customer sells them.
  // Their orders are stamped as consignment and skip the payment chase.
  is_consignment: boolean
  // Signer names an admin removed from the delivery-signer suggestions.
  // Past deliveries keep their signer_name — this only hides the suggestion.
  hidden_signers: string[]
  display_as: string | null
  shops_sold_at: string | null
  storelocator: boolean
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  customer_id: string
  stage: LeadStage
  category: CustomerCategory
  assigned_to: string
  notes: string
  created_at: string
  updated_at: string
  customer?: Customer
  assigned_user?: User
}

export interface Quote {
  id: string
  lead_id: string | null
  customer_id: string
  quote_number: string
  po_number?: string
  items: QuoteItem[]
  subtotal: number
  tax: number
  total: number
  status: QuoteStatus
  template_used: string
  valid_until: string
  created_by: string
  created_at: string
  updated_at: string
  customer?: Customer
  creator?: User
}

export interface OrderEditLogEntry {
  edited_by: string
  edited_at: string
  reason: string
  old_items: QuoteItem[]
  new_items: QuoteItem[]
  old_total: number
  new_total: number
}

export type PaymentType = 'invoice' | 'cash'
/**
 * `consignment_invoice` settles a period of a consignment note (art. 9.2 of the
 * consignment agreement): a real, payable invoice for the quantities reported
 * sold. It never counts as revenue — revenue was already booked on the
 * consignment note itself when it was created.
 */
export type OrderType = 'normal' | 'free_bottle_service' | 'credit_note' | 'consignment_invoice'
export type OrderCurrency = 'XCG' | 'USD' | 'EUR'

export interface Order {
  id: string
  quote_id: string | null
  customer_id: string
  order_number: string
  /** The transport this order travels in. Null = not on a transport number yet. */
  transport_id?: string | null
  /**
   * One entry per package, in packing order. The array LENGTH is the number of
   * colli — there is no separate count, so the two can never disagree. Summed
   * across a transport for the shipping label QR.
   */
  colli_contents?: Colli[]
  transport?: Transport
  payment_type: PaymentType
  order_type: OrderType
  // Stamped from the customer at creation (DB trigger). Consignment orders are
  // kept out of the overdue/te-betalen chase but still count as revenue.
  is_consignment: boolean
  /** For a consignment_invoice: the consignment note whose period it settles. */
  consignment_of?: string | null
  /** Set once the consignment contract has been settled and closed. */
  consignment_closed_at?: string | null
  /** First day of the consignment term (art. 12.1). Null = no term agreed. */
  consignment_start?: string | null
  /** Last day of the term. Drives the closing report and collection deadlines. */
  consignment_end?: string | null
  /**
   * Print this invoice as a cash sale: the Bill To block reads "Cash Payment"
   * instead of the customer's company details. The order itself stays attached
   * to the customer — this only changes what leaves the building on paper.
   */
  cash_invoice?: boolean
  currency: OrderCurrency
  items: QuoteItem[]
  total: number
  assigned_to: string
  status: OrderStatus
  deleted_by?: string | null
  deleted_reason?: string | null
  deleted_at?: string | null
  delivery_notes: string
  po_number: string | null
  planned_date: string | null
  // Invoice date = the delivery date (house rule), stamped by a DB trigger when
  // the delivery is completed. Not the payment date — that's paid_date.
  invoice_date: string | null
  paid_date: string | null
  edit_log: OrderEditLogEntry[]
  created_at: string
  updated_at: string
  customer?: Customer
  assigned_user?: User
  /** The LAST delivery — what "the delivery date" and the proof of delivery mean. */
  delivery?: Delivery
  /** Every run, oldest first. An order can be delivered in parts since migration 058. */
  deliveries?: Delivery[]
}

export type DefectReason =
  | 'damaged' | 'missing' | 'wrong_product' | 'tht_too_short'
  | 'leaking' | 'not_sealed' | 'dirty' | 'quality' | 'other'

/** Seen when the box is opened — only accepted within 48 hours (art. 2.4). */
export const VISIBLE_DEFECT_REASONS: DefectReason[] =
  ['damaged', 'missing', 'wrong_product', 'tht_too_short']

/** Only surfaces when a bottle is handled or opened — reportable any time (art. 2.5). */
export const HIDDEN_DEFECT_REASONS: DefectReason[] =
  ['leaking', 'not_sealed', 'dirty', 'quality', 'other']

export const DEFECT_REASON_LABELS: Record<DefectReason, string> = {
  damaged:       'Damaged or broken',
  missing:       'Missing — fewer than expected',
  wrong_product: 'Wrong product',
  tht_too_short: 'Best-before date too short',
  leaking:       'Bottle leaking',
  not_sealed:    'Not sealed properly',
  dirty:         'Bottle dirty',
  quality:       'Quality of the oil',
  other:         'Something else — describe it',
}

/** Who carries the loss. Only staff decide this — art. 4.3 vs 4.4. */
export type DefectLiability = 'spika' | 'customer' | 'carrier'

export type DefectStatus = 'open' | 'accepted' | 'rejected'

/**
 * Something wrong with what was received. The customer states what and how
 * many, with the batch number and a photo (art. 2.5). SPika decides whose risk
 * it is — that single choice is the difference between a write-off and an
 * invoice line.
 */
export interface DefectReport {
  id: string
  order_id: string
  customer_id: string
  delivery_id: string | null
  sku: string
  qty: number
  batch_number: string
  reason: DefectReason
  note: string
  photo_url: string | null
  status: DefectStatus
  liability: DefectLiability | null
  resolution: string
  reported_by: string | null
  reported_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface Delivery {
  id: string
  order_id: string
  /**
   * The lines handed over in this run. An order can be delivered in parts since
   * migration 058; an empty array means the whole order, which is how every
   * delivery made before that behaves.
   */
  items?: QuoteItem[]
  delivery_started_at: string
  gps_location: GpsLocation
  table_bottles_returned: number
  table_bottles_notes: string
  pod_type: PodType
  pod_file_url: string
  delivered_at: string
  notes: string
  created_at: string
}

export interface TemplateItem {
  sku: string
  name: string
  unit_price: number
}

export type TaskFrequency = 'once' | 'weekly' | 'monthly'

export interface Task {
  id: string
  customer_id: string | null
  assigned_to: string | null
  title: string
  description: string
  frequency: TaskFrequency
  due_date: string | null
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  customer?: Customer
  assigned_user?: User
}

// ── Export Module ──────────────────────────────────────────────────────────────
//
// ExportStatus, ExportDocumentType, Export and ExportDocument lived here until
// 2026-08-15. They described the `exports` table, which migration 054 replaced
// with transports; nothing had referenced them since. Carrier stays — the
// Export tab still picks a carrier when a transport is created.

export interface Carrier {
  id: string
  name: string
  route: string
  bl_template: 'don_andres' | 'generic'
  created_at: string
}

/**
 * A batch of filled bottles. Created at Stock, chosen on an order, carried by a
 * transport, signed for by the customer or received into the warehouse. One
 * thread through the whole business — not to be confused with a production run,
 * which is only litres of oil per month.
 */
export interface Batch {
  id: string
  /** Entered by hand, e.g. 'SPGE22'. */
  batch_number: string
  tht_date: string | null
  notes: string
  created_by: string | null
  created_at: string
}

export type StockReason =
  | 'filled' | 'transport_out' | 'received' | 'order'
  | 'warehouse_out' | 'shopify' | 'handover' | 'return' | 'adjustment'

/** Every bottle in and out. Stock is the sum of these, never a stored total. */
export interface StockMovement {
  id: string
  batch_id: string
  sku: string
  /** Positive puts bottles in, negative takes them out. Never zero. */
  qty: number
  /** Null = Curaçao. Anything else is a warehouse from transport_locations. */
  location_id: string | null
  reason: StockReason
  order_id: string | null
  transport_id: string | null
  note: string
  created_by: string | null
  created_at: string
}

/** A row of the `batch_stock` view: what is where, right now. */
export interface BatchStock {
  batch_id: string
  batch_number: string
  tht_date: string | null
  sku: string
  product_name: string
  location_id: string | null
  qty: number
}

/** What is physically inside one package. */
export interface ColliItem {
  sku: string
  name: string
  qty: number
}

/** One package of an order. An order's colli count is how many of these it has. */
export interface Colli {
  items: ColliItem[]
  /** Gross weight of this one package in kg. Optional — null = not weighed. */
  weight_kg?: number | null
}

export type TransportStatus = 'draft' | 'ready' | 'submitted' | 'cleared' | 'delivered'

/** One of our own warehouse / drop addresses, used when a transport does not go straight to the customer. */
export interface TransportLocation {
  /** The warehouse member responsible for this place. Null = an unmanned address. */
  user_id?: string | null
  user?: { id: string; name: string; email: string } | null
  id: string
  name: string
  street: string
  zip: string
  city: string
  country: string
  created_at: string
}

/**
 * A transport is the journey. Orders hang on it — one transport can carry
 * several, and everything about the trip (carrier, where to, ETD, ETA, freight)
 * lives here rather than on each order, because they travel together and the
 * freight is paid once.
 */
export interface Transport {
  id: string
  transport_number: string
  carrier_id: string | null
  ship_to: 'customer' | 'warehouse'
  location_id: string | null
  destination: string
  etd: string | null
  eta: string | null
  /** Gross weight of the whole load in kg, entered by hand. */
  total_weight_kg: number | null
  freight_cost: number | null
  other_costs: number | null
  notes: string
  status: TransportStatus
  /** Whether the load stays at the warehouse as stock, or is only forwarded. */
  stores_at_warehouse?: boolean
  /** When the warehouse signed the load in. Null = not arrived yet. */
  arrived_at?: string | null
  /** Who signed it in. */
  received_by?: string | null
  /** PATH inside the private pod-files bucket, never a public URL. */
  receipt_signature_url?: string | null
  /** What was counted at intake, per product per order. */
  receipt_lines?: {
    order_id: string; order_number: string; sku: string; name: string
    expected: number; received: number; reason: string
    /** What the customer gets: credited, delivered later, or carried by us. */
    outcome?: 'credit' | 'later' | 'our_loss'
  }[]
  receipt_notes?: string
  created_by: string | null
  created_at: string
  updated_at: string
  carrier?: Carrier
  location?: TransportLocation
  orders?: Order[]
}

/**
 * A document received back for a transport — a stamped B/L, a customs release.
 * file_url holds the STORAGE PATH, never a public URL: these are customs papers
 * and are served through a short-lived signed link.
 */
export interface TransportDocument {
  id: string
  transport_id: string
  document_type: string
  file_url: string
  file_name: string
  uploaded_at: string
}

export interface AccessRequest {
  id: string
  created_at: string
  name: string
  email: string
  company_name: string
  phone?: string
  message?: string
  status: 'pending' | 'link_sent' | 'approved' | 'approved_pending_setup' | 'accepted' | 'denied'
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
  user_id?: string
  country?: string
  onboarding_data?: Record<string, any>
  onboarding_completed_at?: string
}

export interface QuoteTemplate {
  id: string
  name: string
  category: CustomerCategory
  items: TemplateItem[]
  created_at: string
  updated_at: string
}

/**
 * A marketing asset shown in the Marketing tab and the customer portal.
 *
 * `file_ref` holds a Google Drive file id when source is 'drive', and a Supabase
 * storage path when source is 'storage'. Drive carries the heavy public-facing
 * material (photos, POS, clips); storage carries anything that must stay behind
 * the login, such as price lists. See lib/marketing.ts for why.
 */
export interface MarketingAsset {
  id: string
  created_at: string
  updated_at: string
  title: string
  description?: string | null
  category: string
  use_label?: string | null
  source: 'drive' | 'storage'
  file_ref: string
  file_kind?: string | null
  usage_terms?: string | null
  /**
   * Who this is for. 'campaign' means it follows the campaign it belongs to,
   * so changing the audience there moves every asset in it at once.
   *
   * Hides the ROW, not the FILE: Drive links stay open to whoever holds them.
   */
  visibility: 'all' | 'selected' | 'campaign' | 'staff'
  campaign_id?: string | null
  sort_order: number
  is_active: boolean
  download_count: number
  /** Also exists as a physical item a reseller can request. Set per asset, not per category. */
  is_physical: boolean
  /** Switch off when the print run is out — the request button disappears. */
  physical_available: boolean
  created_by?: string | null
}

/**
 * A reseller asking for physical POS material — a shelf talker, a poster.
 *
 * Free for resellers, so it rides along on the next order as a €0 line rather
 * than being sold. The request survives on its own row because it is raised
 * BEFORE there is an order to attach it to.
 */
export interface PosRequest {
  id: string
  created_at: string
  updated_at: string
  customer_id: string
  asset_id: string
  qty: number
  note?: string | null
  status: 'open' | 'planned' | 'sent' | 'declined'
  decline_reason?: string | null
  order_id?: string | null
  requested_by?: string | null
  handled_by?: string | null
  handled_at?: string | null
  // Joined for display, never written.
  asset?: { id: string; title: string; category: string } | null
  customer?: { id: string; company_name: string } | null
}

/** Fields the Team page gets on top of the profile — see /api/admin/users. */
export interface TeamMemberExtras {
  /** A verified authenticator exists on this account. */
  has_2fa?: boolean
  /** From the auth side, so it reflects real sign-ins rather than page views. */
  last_sign_in_at?: string | null
  /** Deactivated: banned from signing in. */
  blocked?: boolean
}
