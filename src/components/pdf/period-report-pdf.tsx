import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { PeriodSnapshot } from '@/lib/report-snapshot'

/**
 * The management report. Same brand language as the invoices (full-width
 * banner, 20pt red title, red table headers) so it reads as one family.
 *
 * Structure follows what makes a report trustworthy rather than pretty:
 * provenance at the top, aggregates first, a reconciliation block that proves
 * the headline ties to the detail, and only then the per-customer appendix.
 */

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'
const GREEN = '#0a7d3f'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },

  // The period is the headline — a report titled "report" tells you nothing,
  // the month it covers is what you look for when you open it.
  title: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: RED, letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: DARK, marginTop: 2 },
  appendixTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, letterSpacing: 1 },

  provenance: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: LIGHT,
    borderLeftWidth: 2,
    borderLeftColor: RED,
    padding: 8,
  },
  provLine: { fontSize: 7.5, color: GRAY, marginBottom: 1 },

  h2: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: RED,
    marginTop: 14,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: RED,
    paddingBottom: 2,
  },
  h3: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 8, marginBottom: 3 },

  // KPI grid
  kpiRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kpi: { flex: 1, backgroundColor: LIGHT, borderRadius: 2, padding: 7, borderWidth: 0.5, borderColor: BORDER },
  kpiValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: RED },
  kpiLabel: { fontSize: 6.5, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  // Tables
  th: { flexDirection: 'row', backgroundColor: RED, paddingVertical: 3.5, paddingHorizontal: 5 },
  thText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tr: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  trAlt: { backgroundColor: LIGHT },
  td: { fontSize: 8, color: DARK },
  tdMuted: { fontSize: 8, color: GRAY },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },

  totalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderTopWidth: 1,
    borderTopColor: DARK,
  },
  totalText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },

  // Reconciliation
  recon: { marginTop: 10, borderWidth: 0.5, borderColor: BORDER, padding: 8, borderRadius: 2 },
  reconTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 },
  reconLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  reconLabel: { fontSize: 7.5, color: GRAY },
  reconValue: { fontSize: 7.5, color: DARK },
  reconOk: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREEN },
  reconBad: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: RED },

  // Appendix
  custBlock: { marginBottom: 12, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2, padding: 8 },
  custName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: RED },
  custMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, marginTop: 4, marginBottom: 5 },
  custMetaCell: { width: '33%', marginBottom: 3 },
  custMetaLabel: { fontSize: 6, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.3 },
  custMetaValue: { fontSize: 8, color: DARK },

  badge: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    backgroundColor: GRAY,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 2,
  },

  empty: { fontSize: 8, color: GRAY, fontStyle: 'italic', paddingVertical: 4, paddingHorizontal: 5 },

  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6.5, color: GRAY },
})

const money = (n: number) =>
  n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * What a single order was actually invoiced for, in the currency it was
 * invoiced in. Aggregates elsewhere are converted to guilders and can be added
 * up; a row about one order must show the figure the customer received, or the
 * report and the invoice disagree. The currency is only spelled out when it is
 * not the default, so the common case stays uncluttered.
 */
const invoiced = (o: { total: number; currency: string }) =>
  o.currency && o.currency !== 'XCG' ? `${o.currency} ${money(o.total)}` : money(o.total)

const shortDate = (d: string | null) =>
  d ? new Date(d.length > 10 ? d : d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '—'

const longDate = (d: string) =>
  new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending',
  processing: 'Processing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  invoice_ready: 'Send invoice',
  invoice_blocked: 'Invoice blocked',
  paid: 'Paid',
}

function Footer({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>SPika CRM · {label} · Confidential</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

function Table({
  head,
  widths,
  rows,
  total,
  emptyText = 'No data for this period',
}: {
  head: string[]
  widths: number[]
  rows: (string | number)[][]
  total?: (string | number)[]
  emptyText?: string
}) {
  const align = (i: number) => (i === 0 ? {} : i === head.length - 1 ? s.right : s.center)
  return (
    <View>
      <View style={s.th}>
        {head.map((h, i) => (
          <Text key={i} style={[s.thText, { flex: widths[i] }, align(i)]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length === 0 && <Text style={s.empty}>{emptyText}</Text>}
      {rows.map((r, ri) => (
        <View key={ri} style={ri % 2 === 1 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
          {r.map((c, ci) => (
            <Text key={ci} style={[s.td, { flex: widths[ci] }, align(ci)]}>
              {String(c)}
            </Text>
          ))}
        </View>
      ))}
      {total && (
        <View style={s.totalRow}>
          {total.map((c, ci) => (
            <Text key={ci} style={[s.totalText, { flex: widths[ci] }, align(ci)]}>
              {String(c)}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

export interface PeriodReportProps {
  snapshot: PeriodSnapshot
  /** Absolute URL to the brand banner. Omitted → text-only header, never fails. */
  bannerSrc?: string
}

export function PeriodReportPDF({ snapshot, bannerSrc }: PeriodReportProps) {
  const { meta, kpis, byCategory, byCustomer, byProduct, byMonth, outstanding, reconciliation } = snapshot
  const cur = 'XCG'
  // Only worth explaining the conversion when there is something to convert.
  const foreignCurrencies = [...new Set(snapshot.orders.map(o => o.currency).filter(c => c && c !== cur))].sort()

  return (
    <Document title={`${meta.label} — SPika CRM Report`} author="SPika CRM">
      {/* ─────────────── Management summary ─────────────── */}
      <Page size="A4" style={s.page}>
        {bannerSrc && (
          <Image src={bannerSrc} style={{ width: '100%', height: 101, objectFit: 'contain' }} />
        )}
        <Text style={s.title}>{meta.label}</Text>

        <View style={s.provenance}>
          <Text style={s.provLine}>
            Period: {longDate(meta.from + 'T12:00:00')} through {longDate(meta.to + 'T12:00:00')} · sales are counted on
            their invoice date, which is the delivery date.
          </Text>
          <Text style={s.provLine}>
            Generated: {longDate(meta.generatedAt)} by {meta.generatedBy} · {meta.orderCount} orders ·{' '}
            {meta.customerCount} customers on file
          </Text>
          <Text style={s.provLine}>
            Revenue counts delivered, awaiting-invoice, blocked and paid orders. Orders still in progress are shown
            separately and are NOT in the revenue figure.
          </Text>
          {foreignCurrencies.length > 0 && (
            <Text style={s.provLine}>
              This period also contains orders in {foreignCurrencies.join(', ')}. Every total and subtotal is converted
              to {cur} at the rate fixed on the invoice date, so the figures can be added up. Rows about a single order
              show what that customer was actually invoiced, in their own currency.
            </Text>
          )}
        </View>

        <Text style={s.h2}>Key Numbers</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{cur} {money(kpis.revenue)}</Text>
            <Text style={s.kpiLabel}>Revenue</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{kpis.bottles}</Text>
            <Text style={s.kpiLabel}>Bottles sold</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{kpis.ordersDelivered}</Text>
            <Text style={s.kpiLabel}>Orders delivered</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{kpis.customersOrdering}</Text>
            <Text style={s.kpiLabel}>Customers ordering</Text>
          </View>
        </View>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{cur} {money(kpis.averageOrder)}</Text>
            <Text style={s.kpiLabel}>Average order</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{cur} {money(kpis.revenueOpen)}</Text>
            <Text style={s.kpiLabel}>Still open ({kpis.ordersOpen})</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{cur} {money(kpis.revenueConsignment)}</Text>
            <Text style={s.kpiLabel}>Of which consignment</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiValue}>{kpis.customersNew} / {kpis.leadsNew}</Text>
            <Text style={s.kpiLabel}>New customers / leads</Text>
          </View>
        </View>
        {kpis.realVolumeMl > 0 && (
          <Text style={[s.tdMuted, { marginTop: 2 }]}>
            Real volume sold: {(kpis.realVolumeMl / 1000).toFixed(1)} L · cash sales included in revenue:{' '}
            {cur} {money(kpis.revenueCash)}
          </Text>
        )}

        <Text style={s.h2}>Revenue by Category</Text>
        <Table
          head={['Category', 'Orders', 'Bottles', `Revenue (${cur})`]}
          widths={[4, 1.2, 1.2, 2]}
          rows={byCategory.map(c => [c.category, c.orders, c.bottles, money(c.revenue)])}
          total={['Total', kpis.ordersDelivered, kpis.bottles, money(kpis.revenue)]}
        />

        <Text style={s.h2}>Revenue by Customer</Text>
        <Table
          head={['Customer', 'Orders', 'Bottles', `Revenue (${cur})`]}
          widths={[4, 1.2, 1.2, 2]}
          rows={byCustomer.map(c => [c.name, c.orders, c.bottles, money(c.revenue)])}
          total={['Total', kpis.ordersDelivered, kpis.bottles, money(kpis.revenue)]}
        />

        <View style={s.recon}>
          <Text style={s.reconTitle}>Reconciliation</Text>
          <View style={s.reconLine}>
            <Text style={s.reconLabel}>Sum of all counted orders</Text>
            <Text style={s.reconValue}>{cur} {money(reconciliation.revenueFromOrders)}</Text>
          </View>
          <View style={s.reconLine}>
            <Text style={s.reconLabel}>Sum of the customer table above</Text>
            <Text style={s.reconValue}>{cur} {money(reconciliation.revenueFromCustomerRows)}</Text>
          </View>
          <View style={s.reconLine}>
            <Text style={s.reconLabel}>Sum of the product lines</Text>
            <Text style={s.reconValue}>{cur} {money(reconciliation.revenueFromProductLines)}</Text>
          </View>
          <View style={s.reconLine}>
            <Text style={s.reconLabel}>Difference</Text>
            <Text style={reconciliation.ties ? s.reconOk : s.reconBad}>
              {reconciliation.ties ? `${cur} 0.00 — totals tie` : `${cur} ${money(reconciliation.difference)} — DOES NOT TIE`}
            </Text>
          </View>
          <Text style={[s.reconLabel, { marginTop: 4 }]}>
            Product lines can differ from the order total: bottle credits and returns are settled at order level, not on
            a product line.
          </Text>
        </View>

        <Footer label={meta.label} />
      </Page>

      {/* ─────────────── Products, outstanding, new business ─────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Sales by Product</Text>
        <Table
          head={['Product', 'Qty', 'Volume', `Revenue (${cur})`]}
          widths={[4, 1.2, 1.2, 2]}
          rows={byProduct.map(p => [
            p.name,
            p.qty,
            p.volumeMl != null ? `${(p.volumeMl / 1000).toFixed(2)} L` : '—',
            money(p.revenue),
          ])}
        />

        {byMonth.length > 1 && (
          <>
            <Text style={s.h2}>Month by Month</Text>
            <Table
              head={['Month', 'Orders', 'Bottles', `Revenue (${cur})`]}
              widths={[4, 1.2, 1.2, 2]}
              rows={byMonth.map(m => [
                new Date(m.month + '-01T12:00:00').toLocaleDateString('en', { month: 'long', year: 'numeric' }),
                m.orders,
                m.bottles,
                money(m.revenue),
              ])}
            />
          </>
        )}

        <Text style={s.h2}>Outstanding Payments</Text>
        <Text style={[s.tdMuted, { marginBottom: 3 }]}>
          Payment terms run from the invoice date. Cash and consignment orders are excluded — consignment is settled
          only once the customer has sold the goods.
        </Text>
        <Table
          head={['Order / Customer', 'Invoiced', 'Due', 'Amount']}
          widths={[4, 1.4, 1.6, 2]}
          rows={outstanding.map(o => [
            `${o.order.order_number} · ${o.order.customer_name}`,
            shortDate(o.order.sales_date),
            o.daysOverdue > 0 ? `${shortDate(o.dueDate)} (${o.daysOverdue}d late)` : shortDate(o.dueDate),
            invoiced(o.order),
          ])}
          // Each row is what that customer owes in their own currency; the sum
          // can only be stated in one, so it is converted and labelled as such.
          total={['Total outstanding', '', '', `${cur} ${money(outstanding.reduce((t, o) => t + o.order.total_xcg, 0))}`]}
          emptyText="Nothing outstanding — everything invoiced in this period has been settled"
        />

        <Text style={s.h2}>New Customers</Text>
        <Table
          head={['Company', 'Category', 'Since', `Revenue (${cur})`]}
          widths={[4, 2, 1.4, 2]}
          rows={snapshot.newCustomers.map(c => [
            c.company_name,
            c.customer_category,
            shortDate(c.created_at),
            money(c.revenue),
          ])}
          emptyText="No new customers in this period"
        />

        <Text style={s.h2}>Leads</Text>
        <Table
          head={['Company', 'Category', 'Contact', 'Touchpoints']}
          widths={[4, 2, 2.4, 1.2]}
          rows={snapshot.leads.map(l => [
            l.company_name,
            l.customer_category,
            l.contact_person || l.email || '—',
            l.contactMoments.length,
          ])}
          emptyText="No open leads"
        />

        <Footer label={meta.label} />
      </Page>

      {/* ─────────────── Appendix: per customer ─────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.appendixTitle}>APPENDIX</Text>
        <Text style={s.subtitle}>Customer detail — {meta.label}</Text>
        <Text style={[s.provLine, { marginTop: 6, marginBottom: 8 }]}>
          Only customers with activity in this period are listed. Every order they placed is shown, including orders
          that are still in progress.
        </Text>

        {snapshot.customers.length === 0 && <Text style={s.empty}>No customer activity in this period.</Text>}

        {snapshot.customers.map(c => (
          <View key={c.id} style={s.custBlock} wrap={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.custName}>
                {c.company_name}
                {c.customer_number ? ` · ${c.customer_number}` : ''}
              </Text>
              <Text style={s.custMetaValue}>
                {cur} {money(c.revenue)} · {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={s.custMetaRow}>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>Category</Text>
                <Text style={s.custMetaValue}>{c.customer_category}</Text>
              </View>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>Contact</Text>
                <Text style={s.custMetaValue}>{c.contact_person || '—'}</Text>
              </View>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>Phone</Text>
                <Text style={s.custMetaValue}>{c.phone || c.whatsapp || '—'}</Text>
              </View>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>E-mail</Text>
                <Text style={s.custMetaValue}>{c.email || '—'}</Text>
              </View>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>City</Text>
                <Text style={s.custMetaValue}>{c.delivery_city || c.billing_city || '—'}</Text>
              </View>
              <View style={s.custMetaCell}>
                <Text style={s.custMetaLabel}>Payment term</Text>
                <Text style={s.custMetaValue}>
                  {c.payment_term_days} days{c.is_consignment ? ' · consignment' : ''}
                </Text>
              </View>
            </View>

            <Table
              head={['Order', 'Date', 'Status', 'Items', 'Invoiced']}
              widths={[1.8, 1.2, 1.8, 4, 1.6]}
              rows={c.orders.map(o => [
                o.order_number,
                shortDate(o.sales_date),
                STATUS_LABEL[o.status] ?? o.status,
                (o.items ?? [])
                  .filter(i => Number(i.qty) > 0)
                  .map(i => `${i.qty}× ${i.name || i.sku}`)
                  .join(', ') || '—',
                invoiced(o),
              ])}
              emptyText="No orders in this period"
            />

            {c.contactMoments.length > 0 && (
              <>
                <Text style={s.h3}>Contact moments</Text>
                {c.contactMoments.map((t, i) => (
                  <Text key={i} style={s.tdMuted}>
                    {shortDate(t.date)} · {t.channel}
                    {t.by ? ` · ${t.by}` : ''}
                    {t.note ? ` — ${t.note}` : ''}
                  </Text>
                ))}
              </>
            )}
          </View>
        ))}

        <Footer label={meta.label} />
      </Page>
    </Document>
  )
}
