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
import { Transport, QuoteItem } from '@/types'
import { CompanyInfo } from '../delivery-note-pdf'
import { formatTht } from '@/lib/utils'
import { transportColli, transportGrossWeight, colliGrossWeight, type ProductWeights } from '@/lib/transport-cargo'
import { isPosLine } from '@/lib/pos'
import { type OrderBatches } from '@/lib/order-batches'

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'

/**
 * What a field says when there is nothing to put in it: nothing.
 *
 * Her decision of 2026-08-19 — "als niet ingevuld laat leeg staan maar wel op
 * pakbon, deze zal ingevuld worden". The label stays on the document, the value
 * is simply blank, and the blank is temporary because the field gets filled in
 * before the load goes.
 *
 * It is a constant rather than a bare '' so this stays one decision in one
 * place, and so nobody puts an em dash back: the standard Helvetica this
 * document uses has no glyph for it and react-pdf draws nothing anyway, which
 * would look identical while pretending to be a placeholder.
 */
const NONE = ''

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
  colBoxSize: { flex: 3, textAlign: 'center' },
  colBoxWeight: { flex: 2, textAlign: 'right' },
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

/**
 * The packing list of a TRANSPORT.
 *
 * One transport, one packing list — her decision of 2026-08-19. A transport can
 * carry several orders; it cannot have several packing lists. This used to be
 * built per order, which produced a separate sheet per reseller for one load
 * and put an order number on a document that has no business carrying one.
 *
 * Two things go on it and nothing else: what is in the load, and who receives
 * it. No order number, no reseller, no prices, no back order. Which orders sit
 * in the load stays in the system, where the warehouse looks it up. A carrier
 * and a customs officer are handed the contents and the address.
 */
interface Props {
  transport: Transport
  company?: CompanyInfo
  /** Batch numbers per sku, from the stock movements. Empty prints nothing. */
  batches?: OrderBatches
  /** What one bottle weighs per sku, in grams, from Products. Drives the gross
   *  weight together with the packaging weight typed on each colli. */
  productWeights?: ProductWeights
}

export function PackingListPDF({
  transport, company = DEFAULT_COMPANY, batches, productWeights = {},
}: Props) {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = transport.etd
    ? fmt(new Date(transport.etd + 'T12:00:00'))
    : fmt(new Date())

  const orders = transport.orders ?? []

  /**
   * What is in the boxes, per product, across the whole load — and which boxes
   * each product sits in, counted over the transport rather than per order, so
   * the numbers match the shipping labels on the boxes themselves.
   *
   * Every figure here comes from the packing. The old sheet took its rows from
   * the boxes and its total from the order, so transport 20260801 printed 43
   * bottles above a summary that said 130.
   */
  const packedBySku = new Map<string, { sku: string; name: string; qty: number; boxes: number[] }>()

  /**
   * Every box on its own line: its number, its size and what it weighs (098).
   *
   * Her instruction of 2026-08-19 — "Zodat je per Colli het gewicht kan zien in
   * app maar ook op de pakbon." A carrier prices a pallet by size and weight
   * together, and a receiver checking off boxes needs to know which is which.
   * The totals lower down are the sum of exactly this list.
   */
  const boxes: { number: number; size: string; kg: number }[] = []

  // Straight off the TRANSPORT since migration 100: the boxes are the load, and
  // the load is packed per product. Which order a box was packed for is not
  // read here and never printed — a carrier and a customs officer have no
  // business with who bought the goods, the same rule that took the reseller
  // name off the shipping label.
  let boxNumber = 0
  for (const colli of transportColli(transport)) {
    boxNumber += 1
    const dims = [colli.length_cm, colli.width_cm, colli.height_cm]
    boxes.push({
      number: boxNumber,
      // Blank when nobody measured it, and a "?" for the one side that is
      // missing when the other two are filled in — an incomplete measurement
      // must not read as a complete one.
      size: dims.every(d => d === null || d === undefined)
        ? NONE
        : dims.map(d => (d === null || d === undefined ? '?' : String(d))).join(' x '),
      kg: colliGrossWeight(colli, productWeights).kg,
    })
    for (const item of colli.items) {
      if (item.qty <= 0) continue
      const row = packedBySku.get(item.sku)
      if (row) {
        row.qty += item.qty
        if (!row.boxes.includes(boxNumber)) row.boxes.push(boxNumber)
      } else {
        packedBySku.set(item.sku, {
          sku: item.sku, name: item.name, qty: item.qty, boxes: [boxNumber],
        })
      }
    }
  }
  const packed = Array.from(packedBySku.values())
  const colliCount = boxNumber
  const totalQty = packed.reduce((sum, r) => sum + r.qty, 0)

  /**
   * POS material travelling with the load — a stand, a box of wobblers.
   *
   * It rides along rather than sitting in a colli of bottles, so it is not in
   * the packing above and would otherwise disappear off the document the moment
   * the packing list stopped printing order lines. It is in the truck, so it is
   * on the list. Counted apart from the bottles: a stand is not a bottle, and
   * it is not a colli either.
   */
  const posBySku = new Map<string, { sku: string; name: string; qty: number }>()
  function addPos(line: { sku: string; name: string; qty: number }) {
    if (line.qty <= 0 || packedBySku.has(line.sku)) return
    const row = posBySku.get(line.sku)
    if (row) row.qty += line.qty
    else posBySku.set(line.sku, { sku: line.sku, name: line.name, qty: line.qty })
  }
  for (const order of orders) {
    for (const line of (order.items ?? []) as QuoteItem[]) {
      if (!isPosLine(line)) continue
      addPos(line)
    }
  }
  // And the material riding on the TRANSPORT itself (migration 101). A load
  // with no order on it carries display material just the same, and before this
  // there was nowhere to say so — so it never reached the document either.
  for (const line of transport.pos_items ?? []) addPos(line)
  const pos = Array.from(posBySku.values())

  /**
   * Gross weight: worked out, never typed.
   *
   * Every box contributes its packaging weight plus the bottles inside it, at
   * the weight the Products screen holds for each one. Her instruction of
   * 2026-08-19. The transport's own total_weight_kg is deliberately ignored —
   * that hand-typed field is what declared 1.00 kg for 42 bottles.
   */
  const gross = transportGrossWeight(transport, productWeights)
  const grossWeightText = gross.kg > 0 ? `${gross.kg.toFixed(2)} kg` : NONE

  /** THT per product, taken from whichever order line carries it. */
  const thtFor = (sku: string) => {
    for (const order of orders) {
      const line = ((order.items ?? []) as QuoteItem[]).find(i => i.sku === sku)
      if (line?.tht_date) return formatTht(line.tht_date)
    }
    return NONE
  }

  /**
   * Who receives this load.
   *
   * A transport goes to one address, so there is one consignee. When a delivery
   * address is picked, THAT address is the consignee and nothing else — the
   * warehouse's own name stays off the paper.
   *
   * Two names live on a delivery address and only one is printed (096):
   *
   *   name   who the goods are addressed to there — "NBC", or a person. Printed.
   *   label  our display name — "Warehouse NL 1". In the app only, never here.
   *
   * Her instruction of 2026-08-19: "wel op pakbon naam, maar niet display naam".
   * A carrier needs a name at the door; it just must not be our internal one.
   * An address with no `name` prints its street and nothing above it, rather
   * than quietly falling back to the label she asked to keep off.
   *
   * Attn. is the transport's own, falling back to the default kept on the
   * address. It matters most here: the drop-off is usually not the warehouse,
   * so the name is what tells the driver who is expecting this.
   */
  const drop = transport.delivery_address
  const attn = (transport.receiver_contact ?? '').trim()
    || (drop?.receiver_contact ?? '').trim()
  const receiver: string[] = (() => {
    if (drop) {
      return [
        drop.name,
        drop.street,
        [drop.zip, drop.city].filter(Boolean).join(' '),
        drop.country,
        attn ? `Attn. ${attn}` : '',
      ].filter(Boolean)
    }
    const loc = transport.location
    if (transport.ship_to === 'warehouse' && loc) {
      return [
        loc.name,
        loc.street,
        [loc.zip, loc.city].filter(Boolean).join(' '),
        loc.country,
        attn ? `Attn. ${attn}` : '',
      ].filter(Boolean)
    }
    return [
      transport.destination || NONE,
      attn ? `Attn. ${attn}` : '',
    ].filter(Boolean)
  })()

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
            {receiver.map((line, i) => (
              <Text
                key={`receiver-${i}`}
                style={i === 0 ? [styles.addressLine, { fontFamily: 'Helvetica-Bold' }] : styles.addressLine}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* No order number here, on purpose. */}
        <View style={styles.metaRow}>
          {[
            { label: 'Transport #',  value: transport.transport_number },
            { label: 'ETD',          value: exportDate },
            { label: 'Carrier',      value: transport.carrier?.name ?? NONE },
            { label: 'Total Colli',  value: `${colliCount}` },
            { label: 'Gross Weight', value: grossWeightText },
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* One row per product, with the boxes it sits in. */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>PRODUCT</Text>
          <Text style={[styles.thText, styles.colCartons]}>COLLI</Text>
          <Text style={[styles.thText, styles.colTht]}>THT / BEST BEFORE</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
        </View>

        {packed.length === 0 && pos.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, styles.colDesc]}>Nothing packed out yet</Text>
            <Text style={[styles.tdText, styles.colCartons]}>{NONE}</Text>
            <Text style={[styles.tdText, styles.colTht]}>{NONE}</Text>
            <Text style={[styles.tdText, styles.colQty]}>{NONE}</Text>
          </View>
        )}

        {packed.map((row, i) => {
          const inBox = batches?.[row.sku] ?? []
          return (
            <View key={row.sku} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colDesc}>
                <Text style={styles.tdText}>{row.name}</Text>
                {inBox.length > 0 && (
                  <Text style={{ fontSize: 7, color: GRAY, marginTop: 1 }}>
                    Batch: {inBox.join(', ')}
                  </Text>
                )}
              </View>
              <Text style={[styles.tdText, styles.colCartons]}>
                {row.boxes.length === colliCount && colliCount > 1 ? 'all' : row.boxes.join(', ')}
              </Text>
              <Text style={[styles.tdText, styles.colTht]}>{thtFor(row.sku)}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{row.qty}</Text>
            </View>
          )
        })}

        {pos.map((row, i) => (
          <View
            key={row.sku}
            style={[styles.tableRow, (packed.length + i) % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={[styles.tdText, styles.colDesc]}>{row.name}</Text>
            <Text style={[styles.tdText, styles.colCartons]}>loose</Text>
            <Text style={[styles.tdText, styles.colTht]}>{NONE}</Text>
            <Text style={[styles.tdText, styles.colQty]}>{row.qty}</Text>
          </View>
        ))}

        {/* The boxes themselves: number, size and weight, one line each (098).
            The table above answers "what is in the load", this answers "what am
            I lifting" — which is what a carrier prices and what a receiver ticks
            off. The totals below are the sum of exactly these lines. */}
        {boxes.length > 0 && (
          <>
            <View style={[styles.tableHeader, { marginTop: 14 }]}>
              <Text style={[styles.thText, styles.colDesc]}>COLLI</Text>
              <Text style={[styles.thText, styles.colBoxSize]}>SIZE L x W x H (CM)</Text>
              <Text style={[styles.thText, styles.colBoxWeight]}>GROSS WEIGHT</Text>
            </View>
            {boxes.map((b, i) => (
              <View key={b.number} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
                <Text style={[styles.tdText, styles.colDesc]}>Colli {b.number}</Text>
                <Text style={[styles.tdText, styles.colBoxSize]}>{b.size}</Text>
                <Text style={[styles.tdText, styles.colBoxWeight]}>
                  {b.kg > 0 ? `${b.kg.toFixed(2)} kg` : NONE}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Bottles</Text>
            <Text style={styles.summaryValue}>{totalQty} bottles</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Colli</Text>
            <Text style={styles.summaryValue}>{colliCount} colli</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Weight</Text>
            <Text style={styles.summaryValue}>{grossWeightText}</Text>
          </View>
        </View>

        {/* Whatever the receiver has to be told: extra label sheets, a display
            travelling loose. transports.notes is NOT this field — that one is
            internal and stays off every document (091). */}
        {!!transport.notes_on_documents && (
          <View style={styles.marksBox}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
              Note
            </Text>
            <Text style={{ fontSize: 9, color: DARK }}>{transport.notes_on_documents}</Text>
          </View>
        )}

        {/* What is written on the outside of the boxes. The receiver and the
            transport number — never the reseller the goods end up with. */}
        <View style={styles.marksBox}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
            Marks &amp; Numbers
          </Text>
          <Text style={{ fontSize: 8, color: GRAY }}>
            {receiver[0] ?? ''}{'\n'}
            {transport.destination || ''}{'\n'}
            {transport.transport_number}{'\n'}
            {/* The box numbers written on the load, matching the shipping
                labels. An en dash drops out of this font the same way an em
                dash does, so the range is spelled with a hyphen. */}
            {colliCount > 0 ? `Colli 1-${colliCount}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
