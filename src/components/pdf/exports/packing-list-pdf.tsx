import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Line,
  Svg,
  Image,
} from '@react-pdf/renderer'
import { Transport, Order, QuoteItem } from '@/types'
import { CompanyInfo } from '../delivery-note-pdf'
import { addressLines, isEuropeanAddress } from '@/lib/address'
import { formatTht } from '@/lib/utils'
import { orderColli, orderColliWeight } from '@/lib/transport-cargo'
import { type OrderBatches } from '@/lib/order-batches'

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
  divider: { marginVertical: 10 },
  addressRow: { flexDirection: 'row', gap: 40, marginBottom: 16 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addressLine: { fontSize: 9, color: DARK, marginBottom: 1 },
  addressRed: { fontSize: 9, color: RED, marginBottom: 1 },
  metaRow: { flexDirection: 'row', gap: 0, marginBottom: 14 },
  metaBlock: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 2 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, color: DARK },
  tableHeader: { flexDirection: 'row', backgroundColor: RED, paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: LIGHT },
  colDesc: { flex: 3 },
  colTht: { flex: 2, textAlign: 'center' },
  colQty: { flex: 1.5, textAlign: 'center' },
  colCartons: { flex: 1.5, textAlign: 'center' },
  colWeight: { flex: 1.5, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 9, color: DARK },
  summaryBox: { marginTop: 14, padding: 10, backgroundColor: LIGHT, borderRadius: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontSize: 9, color: GRAY },
  summaryValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  marksBox: { marginTop: 14, padding: 10, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2 },
})

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Mils Inc.',
  address_line1: 'Kaya Kiwa 31-a',
  address_line2: 'Willemstad Curacao CW',
  email: 'd.thijm@milsinc.com',
  phone: '5999-6896969',
  crib_number: '102471812',
  coc_number: '145141',
}

interface Props {
  transport: Transport
  order: Order
  company?: CompanyInfo
  /** Batch numbers per sku, from the stock movements. Empty prints nothing. */
  batches?: OrderBatches
}

export function PackingListPDF({ transport, order, company = DEFAULT_COMPANY, batches }: Props) {
  const customer = order.customer as any
  const items: QuoteItem[] = (order.items ?? []) as QuoteItem[]
  const activeItems = items.filter(i => i.qty > 0)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = transport.etd
    ? fmt(new Date(transport.etd + 'T12:00:00'))
    : fmt(new Date())

  const thtDate = '—'

  const totalQty = activeItems.reduce((sum, i) => sum + i.qty, 0)
  // Real packing, not an estimate from bottle counts: these are the packages
  // somebody actually filled, with the weights they were given.
  const colli = orderColli(order)
  const colliWeight = orderColliWeight(order)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={{ marginBottom: 2 }}>
          <Image src="/spika-banner.png" style={{ width: '100%', height: 101, objectFit: 'contain' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 }}>
          <Text style={styles.title}>PACKING LIST</Text>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* Shipper / Consignee */}
        <View style={styles.addressRow}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Shipper</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{company.name}</Text>
            <Text style={styles.addressLine}>{company.address_line1}</Text>
            <Text style={styles.addressLine}>{company.address_line2}</Text>
            <Text style={styles.addressRed}>{company.email}</Text>
            <Text style={styles.addressLine}>{company.phone}</Text>
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Consignee</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>
              {customer?.company_name ?? '—'}
            </Text>
            <Text style={styles.addressLine}>{customer?.contact_person ?? ''}</Text>
            {/* Shared layout — see lib/address.ts */}
            {addressLines(customer?.billing_address as any, isEuropeanAddress(customer?.billing_address as any)).map((line, i) => (
              <Text key={`p${i}`} style={styles.addressLine}>{line}</Text>
            ))}
            <Text style={styles.addressLine}>Destination: {transport.destination || '—'}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          {[
            { label: 'Transport #',    value: transport.transport_number },
            { label: 'Order #',        value: order.order_number },
            { label: 'ETD',            value: exportDate },
            { label: 'Carrier',        value: transport.carrier?.name ?? '—' },
            { label: 'Total Colli',    value: `${colli.length} colli` },
            { label: 'Gross Weight',   value: colliWeight > 0 ? `${colliWeight.toFixed(2)} kg` : '—' },
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* One row per colli — a packing list should say what is in each box,
            not what the total happens to divide into. */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>COLLI / CONTENTS</Text>
          <Text style={[styles.thText, styles.colTht]}>THT / BEST BEFORE</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
          <Text style={[styles.thText, styles.colWeight]}>GROSS WEIGHT</Text>
        </View>

        {colli.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, styles.colDesc]}>Not packed out yet</Text>
            <Text style={[styles.tdText, styles.colTht]}>—</Text>
            <Text style={[styles.tdText, styles.colQty]}>—</Text>
            <Text style={[styles.tdText, styles.colWeight]}>—</Text>
          </View>
        ) : colli.map((c, i) => {
          const qty = c.items.reduce((sum, it) => sum + it.qty, 0)
          const contents = c.items.length
            ? c.items.map(it => `${it.name} x${it.qty}`).join(', ')
            : 'Empty'
          // The THT belongs to the product, so it is looked up on the order line
          // this package was filled from.
          const tht = c.items
            .map(it => formatTht(items.find(x => x.sku === it.sku)?.tht_date))
            .filter(Boolean)[0] ?? thtDate
          return (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colDesc}>
                <Text style={styles.tdText}>Colli {i + 1} — {contents}</Text>
                {/* Which batches are in this box. A box can hold bottles from
                    two, so every batch behind its contents is named. */}
                {(() => {
                  const inBox = Array.from(new Set(
                    c.items.flatMap(it => (batches?.[it.sku] ?? []))
                  ))
                  return inBox.length > 0 ? (
                    <Text style={{ fontSize: 7, color: GRAY, marginTop: 1 }}>
                      Batch: {inBox.join(', ')}
                    </Text>
                  ) : null
                })()}
              </View>
              <Text style={[styles.tdText, styles.colTht]}>{tht}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{qty} btls</Text>
              <Text style={[styles.tdText, styles.colWeight]}>
                {c.weight_kg === null || c.weight_kg === undefined
                  ? '—'
                  : `${Number(c.weight_kg).toFixed(2)} kg`}
              </Text>
            </View>
          )
        })}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Bottles</Text>
            <Text style={styles.summaryValue}>{totalQty} bottles</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Colli</Text>
            <Text style={styles.summaryValue}>{colli.length} colli</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Weight</Text>
            <Text style={styles.summaryValue}>
              {colliWeight > 0 ? `${colliWeight.toFixed(2)} kg` : '—'}
            </Text>
          </View>
        </View>

        {/* Marks & Numbers */}
        {/* Whatever the receiver has to be told: extra label sheets, a
            display travelling loose, anything not on a line of its own.
            transports.notes is NOT this field — that one is internal and has
            been used as such. See migration 091. */}
        {!!(transport as any).notes_on_documents && (
          <View style={styles.marksBox}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
              Note
            </Text>
            <Text style={{ fontSize: 9, color: DARK }}>
              {(transport as any).notes_on_documents}
            </Text>
          </View>
        )}

        <View style={styles.marksBox}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
            Marks &amp; Numbers
          </Text>
          <Text style={{ fontSize: 8, color: GRAY }}>
            {customer?.company_name ?? ''}{'\n'}
            {transport.destination || ''}{'\n'}
            {transport.transport_number} · {order.order_number}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
