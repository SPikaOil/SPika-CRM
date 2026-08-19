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

  // Real packing, not an estimate from bottle counts: these are the packages
  // somebody actually filled, with the weights they were given.
  const colli = orderColli(order)
  const colliWeight = orderColliWeight(order)

  /**
   * What is in the boxes, per product — which is what a packing list is.
   *
   * It used to be one row per BOX, and the total underneath came from the
   * ORDER instead. Order 729134 printed one row saying 43 bottles above a
   * summary saying 130, on the same sheet: two numbers from two sources, on a
   * document a carrier and customs read.
   *
   * Both come from the packing now, so they cannot disagree. Which box a
   * product sits in stays — as a column, not as the way the page is built.
   */
  const packedBySku = new Map<string, { sku: string; name: string; qty: number; boxes: number[] }>()
  colli.forEach((c, boxIndex) => {
    for (const it of c.items) {
      const row = packedBySku.get(it.sku)
      if (row) {
        row.qty += it.qty
        if (!row.boxes.includes(boxIndex + 1)) row.boxes.push(boxIndex + 1)
      } else {
        packedBySku.set(it.sku, { sku: it.sku, name: it.name, qty: it.qty, boxes: [boxIndex + 1] })
      }
    }
  })
  const packed = Array.from(packedBySku.values())
  const totalQty = packed.reduce((sum, r) => sum + r.qty, 0)

  /**
   * Ordered, but not in this shipment.
   *
   * A transport is not an order. Send 150 bottles, have a carrier lose a
   * pallet, and the rest follows on the same order — her words, 2026-08-19.
   * So the document says what travels AND what is still to come, instead of
   * implying the order left in one piece.
   */
  const backorder = activeItems
    .map(i => ({ name: i.name, qty: i.qty - (packedBySku.get(i.sku)?.qty ?? 0) }))
    .filter(r => r.qty > 0)
  const backorderQty = backorder.reduce((sum, r) => sum + r.qty, 0)

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

        {/* One row per PRODUCT, with the box it sits in as a column.
            A packing list answers "what is in this shipment"; which carton a
            bottle happens to be in is a detail on that answer, not the way to
            organise the page. It used to be the other way round. */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>PRODUCT</Text>
          <Text style={[styles.thText, styles.colCartons]}>COLLI</Text>
          <Text style={[styles.thText, styles.colTht]}>THT / BEST BEFORE</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
        </View>

        {packed.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, styles.colDesc]}>Not packed out yet</Text>
            <Text style={[styles.tdText, styles.colCartons]}>—</Text>
            <Text style={[styles.tdText, styles.colTht]}>—</Text>
            <Text style={[styles.tdText, styles.colQty]}>—</Text>
          </View>
        ) : packed.map((r, i) => {
          const line = items.find(x => x.sku === r.sku)
          const inBox = batches?.[r.sku] ?? []
          return (
            <View key={r.sku} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colDesc}>
                <Text style={styles.tdText}>{r.name}</Text>
                {inBox.length > 0 && (
                  <Text style={{ fontSize: 7, color: GRAY, marginTop: 1 }}>
                    Batch: {inBox.join(', ')}
                  </Text>
                )}
              </View>
              <Text style={[styles.tdText, styles.colCartons]}>
                {r.boxes.length === colli.length && colli.length > 1
                  ? 'all'
                  : r.boxes.join(', ')}
              </Text>
              <Text style={[styles.tdText, styles.colTht]}>{formatTht(line?.tht_date) || thtDate}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{r.qty}</Text>
            </View>
          )
        })}

        {/* What was ordered and is NOT in this box. Named rather than left to
            arithmetic, because the receiver counting bottles against an order
            confirmation should not have to work out that more is coming. */}
        {backorder.length > 0 && (
          <View style={{ marginTop: 12, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2 }}>
            <View style={{ backgroundColor: LIGHT, paddingVertical: 4, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase' }}>
                To follow — back order on {order.order_number}
              </Text>
            </View>
            {backorder.map(r => (
              <View key={r.name} style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6 }}>
                <Text style={[styles.tdText, styles.colDesc, { color: GRAY }]}>{r.name}</Text>
                <Text style={[styles.tdText, styles.colQty, { color: GRAY }]}>{r.qty}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 0.5, borderTopColor: BORDER }}>
              <Text style={[styles.tdText, styles.colDesc, { fontFamily: 'Helvetica-Bold' }]}>Still to come</Text>
              <Text style={[styles.tdText, styles.colQty, { fontFamily: 'Helvetica-Bold' }]}>{backorderQty}</Text>
            </View>
          </View>
        )}


        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            {/* Named for what it counts. "Total bottles" next to a back-order
                block invites the question this document exists to answer. */}
            <Text style={styles.summaryLabel}>Bottles in this shipment</Text>
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
