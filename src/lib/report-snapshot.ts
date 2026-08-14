import { SupabaseClient } from '@supabase/supabase-js'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { QuoteItem } from '@/types'

/**
 * One canonical picture of the CRM over a period.
 *
 * Every export — the PDF, the workbook, the flat CSV — is rendered from this
 * single snapshot, so a number can never differ between two of them. Add a
 * figure here, not in a renderer.
 *
 * Period membership follows the house rule: an order belongs to the month it
 * was DELIVERED in (sales_date), never the month it was created or planned.
 * Customers, leads and contact moments carry their own dates and are selected
 * on those — a customer from 2024 with an order in June still appears in the
 * June report, through that order.
 */

// Statuses that represent a sale that actually happened.
export const REVENUE_STATUSES = ['delivered', 'invoice_ready', 'invoice_blocked', 'paid']
// Still in flight — counted separately so the report never hides them.
export const OPEN_STATUSES = ['pending_approval', 'processing', 'out_for_delivery']

const BOTTLE_SKUS = ['oil-100ml', 'oil-50ml', 'oil-30ml-table', 'spika2go-5ml', 'spika2go-3ml']

export interface SnapshotOrder {
  id: string
  order_number: string
  status: string
  sales_date: string
  planned_date: string | null
  invoice_date: string | null
  paid_date: string | null
  created_at: string
  /** What the customer was invoiced, in their own currency. */
  total: number
  currency: string
  /** XCG per 1 unit of `currency`, frozen at the invoice date (051). */
  fx_rate: number
  /** `total` converted to XCG — the only figure safe to sum across currencies. */
  total_xcg: number
  payment_type: string
  order_type: string
  is_consignment: boolean
  po_number: string | null
  customer_id: string
  customer_name: string
  customer_category: string
  assigned_to: string | null
  items: QuoteItem[]
  delivered_at: string | null
  signer_name: string | null
  delivery_notes: string
}

export interface SnapshotCustomer {
  id: string
  customer_number: string | null
  company_name: string
  customer_category: string
  contact_person: string
  email: string
  phone: string
  whatsapp: string
  status: string
  is_lead: boolean
  is_consignment: boolean
  payment_term_days: number
  billing_city: string
  billing_country: string
  delivery_city: string
  vat_number: string
  coc_number: string
  crib_number: string
  internal_notes: string
  created_at: string
  // Only the touchpoints that fall inside the period.
  contactMoments: { date: string; by: string; channel: string; note: string }[]
  // Filled in below: this customer's activity within the period.
  orders: SnapshotOrder[]
  revenue: number
  orderCount: number
  bottles: number
}

export interface PeriodSnapshot {
  meta: {
    from: string
    to: string
    label: string
    generatedAt: string
    generatedBy: string
    orderCount: number
    customerCount: number
  }
  kpis: {
    revenue: number
    revenueOpen: number
    revenueConsignment: number
    revenueCash: number
    bottles: number
    realVolumeMl: number
    ordersTotal: number
    ordersDelivered: number
    ordersOpen: number
    customersActive: number
    customersOrdering: number
    customersNew: number
    leadsNew: number
    averageOrder: number
  }
  byCategory: { category: string; orders: number; revenue: number; bottles: number }[]
  byCustomer: { id: string; name: string; orders: number; revenue: number; bottles: number }[]
  byProduct: { sku: string; name: string; qty: number; revenue: number; volumeMl: number | null }[]
  byMonth: { month: string; orders: number; revenue: number; bottles: number }[]
  orders: SnapshotOrder[]
  customers: SnapshotCustomer[]
  newCustomers: SnapshotCustomer[]
  leads: SnapshotCustomer[]
  outstanding: { order: SnapshotOrder; dueDate: string; daysOverdue: number }[]
  /**
   * Proof that the headline number is the sum of the detail. An auditor's first
   * question is whether page 1 ties to the appendix; this answers it in the
   * document itself.
   */
  reconciliation: {
    revenueFromOrders: number
    revenueFromCustomerRows: number
    revenueFromProductLines: number
    difference: number
    ties: boolean
  }
}

const num = (v: unknown) => Number(v ?? 0)

function monthKey(d: string) {
  return d.slice(0, 7)
}

export function periodLabel(from: string, to: string) {
  const f = new Date(from + 'T12:00:00')
  const t = new Date(to + 'T12:00:00')
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  if (sameMonth) return f.toLocaleDateString('en', { month: 'long', year: 'numeric' })
  return `${f.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })} – ${t.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** 'JUN 2026' — the naming the Drive backups use. */
export function periodFileLabel(from: string) {
  const d = new Date(from + 'T12:00:00')
  return `${d.toLocaleDateString('en', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`
}

export async function buildPeriodSnapshot(
  admin: SupabaseClient,
  opts: { from: string; to: string; generatedBy?: string }
): Promise<PeriodSnapshot> {
  const { from, to } = opts

  const [ordersRes, customersRes, productsRes, fxRes] = await Promise.all([
    admin
      .from('orders_with_sales_date')
      .select(
        // currency/fx_rate are NOT selected here: this view was created with
        // `o.*` in migration 048, so it still exposes the column list of that
        // moment. They are fetched from the orders table below and merged in.
        'id, order_number, status, sales_date, planned_date, invoice_date, paid_date, created_at, total, payment_type, order_type, is_consignment, po_number, customer_id, assigned_to, items, delivery_notes, customer:customers(id, company_name, customer_category), delivery:deliveries(delivered_at, signer_name)'
      )
      .gte('sales_date', from)
      .lte('sales_date', to)
      .is('deleted_at', null)
      .order('sales_date', { ascending: true }),
    admin
      .from('customers')
      .select('*')
      .order('company_name', { ascending: true }),
    admin.from('products').select('sku, real_volume_ml'),
    // Only the orders that are not in guilders — everything else is rate 1.
    admin.from('orders').select('id, currency, fx_rate').neq('currency', 'XCG'),
  ])

  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`)
  if (customersRes.error) throw new Error(`customers: ${customersRes.error.message}`)

  // id -> { currency, rate }. Absent means guilders at rate 1.
  const fxById = new Map<string, { currency: string; rate: number }>(
    ((fxRes?.data ?? []) as { id: string; currency: string; fx_rate: number }[])
      .map(r => [r.id, { currency: r.currency ?? 'XCG', rate: num(r.fx_rate) || 1 }])
  )

  const volumeBySku: Record<string, number | null> = {}
  for (const p of (productsRes.data ?? []) as { sku: string; real_volume_ml: number | null }[]) {
    volumeBySku[p.sku] = p.real_volume_ml
  }

  const orders: SnapshotOrder[] = (ordersRes.data ?? []).map((o: any) => {
    const del = Array.isArray(o.delivery) ? o.delivery[0] : o.delivery
    const cust = Array.isArray(o.customer) ? o.customer[0] : o.customer
    return {
      id: o.id,
      order_number: o.order_number ?? '',
      status: o.status,
      sales_date: o.sales_date,
      planned_date: o.planned_date,
      invoice_date: o.invoice_date,
      paid_date: o.paid_date ?? null,
      created_at: o.created_at,
      total: num(o.total),
      currency: fxById.get(o.id)?.currency ?? 'XCG',
      fx_rate: fxById.get(o.id)?.rate ?? 1,
      total_xcg: Number((num(o.total) * (fxById.get(o.id)?.rate ?? 1)).toFixed(2)),
      payment_type: o.payment_type ?? 'invoice',
      order_type: o.order_type ?? 'normal',
      is_consignment: !!o.is_consignment,
      po_number: o.po_number ?? null,
      customer_id: o.customer_id,
      customer_name: cust?.company_name ?? 'Unknown',
      customer_category: cust?.customer_category ?? '—',
      assigned_to: o.assigned_to ?? null,
      items: (o.items ?? []) as QuoteItem[],
      delivered_at: del?.delivered_at ?? null,
      signer_name: del?.signer_name ?? null,
      delivery_notes: o.delivery_notes ?? '',
    }
  })

  // A consignment invoice settles a period of a consignment note that was
  // already counted in full when it was created. Counting it here as well would
  // book the same bottles twice — once as stock placed, once as stock sold.
  // It is a payable invoice, not new revenue.
  // Consignment counts from the moment the note is created, not from delivery —
  // Danique's rule, and the contract's: the goods are placed, the value is
  // booked, and payment follows the reported sales later. Without this an admin
  // has to mark a shipment "delivered" while it is still at sea just to get the
  // month right, which is exactly what happened to 729134.
  const revenueOrders = orders.filter(o =>
    (REVENUE_STATUSES.includes(o.status) || (o.is_consignment && o.status !== 'deleted'))
    && o.order_type !== 'consignment_invoice'
  )
  const openOrders = orders.filter(o => OPEN_STATUSES.includes(o.status))

  // ── Customers ────────────────────────────────────────────────────────────
  const allCustomers = (customersRes.data ?? []) as any[]
  const ordersByCustomer = new Map<string, SnapshotOrder[]>()
  for (const o of orders) {
    const list = ordersByCustomer.get(o.customer_id) ?? []
    list.push(o)
    ordersByCustomer.set(o.customer_id, list)
  }

  const bottlesOf = (list: SnapshotOrder[]) =>
    list.reduce(
      (s, o) => s + (o.items ?? []).filter(i => BOTTLE_SKUS.includes(i.sku)).reduce((t, i) => t + num(i.qty), 0),
      0
    )

  const toSnapshotCustomer = (c: any): SnapshotCustomer => {
    const mine = ordersByCustomer.get(c.id) ?? []
    const revenueMine = mine.filter(o => REVENUE_STATUSES.includes(o.status))
    const touchpoints = ((c.contact_log ?? []) as any[])
      .filter(e => e?.contacted_at && e.contacted_at >= from && e.contacted_at <= to)
      .map(e => ({
        date: e.contacted_at,
        by: e.contacted_by ?? '',
        channel: e.channel ?? '',
        note: e.note ?? '',
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return {
      id: c.id,
      customer_number: c.customer_number ?? null,
      company_name: c.company_name ?? '',
      customer_category: c.customer_category ?? '—',
      contact_person: c.contact_person ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      whatsapp: c.whatsapp ?? '',
      status: c.status ?? 'active',
      is_lead: !!c.is_lead,
      is_consignment: !!c.is_consignment,
      payment_term_days: c.payment_term_days ?? 7,
      billing_city: c.billing_address?.city ?? '',
      billing_country: c.billing_address?.country ?? '',
      delivery_city: c.delivery_address?.city ?? '',
      vat_number: c.vat_number ?? '',
      coc_number: c.coc_number ?? '',
      crib_number: c.crib_number ?? '',
      internal_notes: c.internal_notes ?? '',
      created_at: c.created_at,
      contactMoments: touchpoints,
      orders: mine,
      revenue: revenueMine.reduce((s, o) => s + o.total_xcg, 0),
      orderCount: mine.length,
      bottles: bottlesOf(revenueMine),
    }
  }

  const customersAll = allCustomers.map(toSnapshotCustomer)
  const customers = customersAll.filter(c => !c.is_lead)
  const leads = customersAll.filter(c => c.is_lead)
  const newCustomers = customers.filter(c => c.created_at >= from && c.created_at <= to + 'T23:59:59')
  const newLeads = leads.filter(c => c.created_at >= from && c.created_at <= to + 'T23:59:59')

  // ── Aggregates ───────────────────────────────────────────────────────────
  const catMap = new Map<string, { orders: number; revenue: number; bottles: number }>()
  for (const o of revenueOrders) {
    const k = o.customer_category || '—'
    const e = catMap.get(k) ?? { orders: 0, revenue: 0, bottles: 0 }
    e.orders++
    e.revenue += o.total_xcg
    e.bottles += bottlesOf([o])
    catMap.set(k, e)
  }

  const custMap = new Map<string, { id: string; name: string; orders: number; revenue: number; bottles: number }>()
  for (const o of revenueOrders) {
    const e = custMap.get(o.customer_id) ?? { id: o.customer_id, name: o.customer_name, orders: 0, revenue: 0, bottles: 0 }
    e.orders++
    e.revenue += o.total_xcg
    e.bottles += bottlesOf([o])
    custMap.set(o.customer_id, e)
  }

  const prodMap = new Map<string, { sku: string; name: string; qty: number; revenue: number }>()
  for (const o of revenueOrders) {
    for (const item of o.items ?? []) {
      const e = prodMap.get(item.sku) ?? {
        sku: item.sku,
        name: SPIKA_PRODUCTS.find(p => p.sku === item.sku)?.name ?? item.sku,
        qty: 0,
        revenue: 0,
      }
      e.qty += num(item.qty)
      // Line totals are in the order's own currency. Converting here is what
      // keeps this column addable and lets it tie to the headline revenue —
      // summing a EUR line straight into guilders silently inflates the total
      // and then the reconciliation block reports a difference it cannot explain.
      e.revenue += num(item.line_total) * o.fx_rate
      prodMap.set(item.sku, e)
    }
  }

  const monthMap = new Map<string, { orders: number; revenue: number; bottles: number }>()
  for (const o of revenueOrders) {
    const k = monthKey(o.sales_date)
    const e = monthMap.get(k) ?? { orders: 0, revenue: 0, bottles: 0 }
    e.orders++
    e.revenue += o.total_xcg
    e.bottles += bottlesOf([o])
    monthMap.set(k, e)
  }

  const byProduct = [...prodMap.values()]
    .filter(p => p.qty > 0)
    .map(p => ({
      ...p,
      volumeMl: volumeBySku[p.sku] != null ? volumeBySku[p.sku]! * p.qty : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Outstanding (same rule as the dashboard chase) ──────────────────────
  const termByCustomer = new Map<string, number>(allCustomers.map(c => [c.id, c.payment_term_days ?? 7]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const outstanding = orders
    .filter(o => ['invoice_ready', 'invoice_blocked'].includes(o.status))
    .filter(o => o.payment_type !== 'cash' && !o.is_consignment)
    .map(o => {
      const term = termByCustomer.get(o.customer_id) ?? 7
      const due = new Date(o.sales_date + 'T12:00:00')
      due.setDate(due.getDate() + term)
      due.setHours(0, 0, 0, 0)
      return {
        order: o,
        dueDate: due.toISOString().slice(0, 10),
        daysOverdue: Math.floor((today.getTime() - due.getTime()) / 86400000),
      }
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  const revenue = revenueOrders.reduce((s, o) => s + o.total_xcg, 0)
  const bottles = bottlesOf(revenueOrders)
  const realVolumeMl = revenueOrders.reduce(
    (s, o) =>
      s +
      (o.items ?? []).reduce((t, i) => {
        const vol = volumeBySku[i.sku]
        return t + (BOTTLE_SKUS.includes(i.sku) && vol != null ? num(i.qty) * vol : 0)
      }, 0),
    0
  )

  const revenueFromCustomerRows = [...custMap.values()].reduce((s, c) => s + c.revenue, 0)
  const revenueFromProductLines = byProduct.reduce((s, p) => s + p.revenue, 0)

  return {
    meta: {
      from,
      to,
      label: periodLabel(from, to),
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy ?? 'SPika CRM',
      orderCount: orders.length,
      customerCount: customers.length,
    },
    kpis: {
      revenue,
      revenueOpen: openOrders.reduce((s, o) => s + o.total_xcg, 0),
      revenueConsignment: revenueOrders.filter(o => o.is_consignment).reduce((s, o) => s + o.total_xcg, 0),
      revenueCash: revenueOrders.filter(o => o.payment_type === 'cash').reduce((s, o) => s + o.total_xcg, 0),
      bottles,
      realVolumeMl,
      ordersTotal: orders.length,
      ordersDelivered: revenueOrders.length,
      ordersOpen: openOrders.length,
      customersActive: customers.filter(c => c.status === 'active').length,
      customersOrdering: custMap.size,
      customersNew: newCustomers.length,
      leadsNew: newLeads.length,
      averageOrder: revenueOrders.length ? revenue / revenueOrders.length : 0,
    },
    byCategory: [...catMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byCustomer: [...custMap.values()].sort((a, b) => b.revenue - a.revenue),
    byProduct,
    byMonth: [...monthMap.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    orders,
    // Appendix only covers customers that actually did something this period —
    // 26 empty customer blocks is padding, not information.
    customers: customers.filter(c => c.orderCount > 0 || c.contactMoments.length > 0),
    newCustomers,
    leads,
    outstanding,
    reconciliation: {
      revenueFromOrders: revenue,
      revenueFromCustomerRows,
      revenueFromProductLines,
      difference: Math.round((revenue - revenueFromCustomerRows) * 100) / 100,
      ties: Math.abs(revenue - revenueFromCustomerRows) < 0.01,
    },
  }
}
