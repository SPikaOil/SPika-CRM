export type UserRole = 'admin' | 'sales' | 'customer'

export type CustomerCategory = 'wholesale' | 'horeca' | 'dtf' | 'other' | 'b2c' | 'supermarket' | 'shops' | 'export'

export type LeadStage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'

export type OrderStatus =
  | 'pending_approval'
  | 'processing'
  | 'out_for_delivery'
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
  created_at: string
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

export interface Customer {
  id: string
  company_name: string
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
  vat_number: string
  coc_number: string
  crib_number: string
  is_international: boolean
  product_prices: Record<string, number>
  product_discounts: Record<string, number>
  free_products: string[]
  active_products: string[]
  table_bottle_return_price: number
  payment_term_days: number
  spika_stands: SpikaStand[]
  status: CustomerStatus
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
export type OrderType = 'normal' | 'free_bottle_service'

export interface Order {
  id: string
  quote_id: string | null
  customer_id: string
  order_number: string
  payment_type: PaymentType
  order_type: OrderType
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
  invoice_date: string | null
  edit_log: OrderEditLogEntry[]
  created_at: string
  updated_at: string
  customer?: Customer
  assigned_user?: User
  delivery?: Delivery
}

export interface Delivery {
  id: string
  order_id: string
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

export type ExportStatus = 'draft' | 'ready' | 'submitted' | 'cleared' | 'delivered'

export type ExportDocumentType = 'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'received_doc'

export interface Carrier {
  id: string
  name: string
  route: string
  bol_template: 'don_andres' | 'generic'
  created_at: string
}

export interface Export {
  id: string
  export_number: string
  order_id: string | null
  customer_id: string | null
  carrier_id: string | null
  destination: string
  export_date: string | null
  tht_date: string | null
  notes: string
  currency: string
  status: ExportStatus
  items: QuoteItem[]
  created_by: string | null
  created_at: string
  updated_at: string
  order?: Order
  customer?: Customer
  carrier?: Carrier
}

export interface ExportDocument {
  id: string
  export_id: string
  document_type: ExportDocumentType
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
  status: 'pending' | 'approved' | 'denied'
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
}

export interface QuoteTemplate {
  id: string
  name: string
  category: CustomerCategory
  items: TemplateItem[]
  created_at: string
  updated_at: string
}
