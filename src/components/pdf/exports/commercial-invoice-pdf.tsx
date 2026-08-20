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
import { batchLabel, type OrderBatches } from '@/lib/order-batches'
import { transportColli, type ProductHsCodes } from '@/lib/transport-cargo'
import { customsRegion } from '@/lib/country'

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
  invoiceTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
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
  colDesc: { flex: 4 },
  colHs: { flex: 2 },
  colQty: { flex: 1, textAlign: 'center' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 9, color: DARK },
  totalsSection: { alignItems: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', gap: 16, paddingVertical: 2 },
  totalLabel: { fontSize: 9, color: GRAY, textAlign: 'right', width: 120 },
  totalValue: { fontSize: 9, color: DARK, textAlign: 'right', width: 80 },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', width: 120 },
  grandValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right', width: 80 },
  certSection: { marginTop: 20, padding: 10, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2 },
  certText: { fontSize: 8, color: GRAY, lineHeight: 1.5 },
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
 * The commercial invoice of a TRANSPORT.
 *
 * One per transport, like the packing list, and customs must be able to lay the
 * two side by side and see the same load twice. Her instruction of 2026-08-19:
 * "Commercial invoice van een Transport is altijd enkel wat in het transport
 * zit (...) die exact gelijk is aan pakbon", and then plainly: "de order is
 * niet leidend in een transport."
 *
 * So the consignee is the address the load actually goes to — the delivery
 * address of the warehouse — and not the reseller who happens to have bought
 * the goods. The orders behind it still set every price; they set nothing else.
 */
interface Props {
  transport: Transport
  company?: CompanyInfo
  /** Batch numbers per sku across the whole load. Empty prints nothing. */
  batches?: OrderBatches
  /** Both customs codes per sku, from Products. The destination picks one. */
  hsCodes?: ProductHsCodes
}

export function CommercialInvoicePDF({
  transport, company = DEFAULT_COMPANY, batches, hsCodes = {},
}: Props) {
  const orders = transport.orders ?? []

  /**
   * Which customs code applies to this load.
   *
   * The same bottle is classified differently by European and American customs,
   * so a product carries both and the destination decides — her instruction of
   * 2026-08-19: "dat facturen de HS code pakken adhv land waar het heengaat."
   * Transport 20260801 goes to The Netherlands, so it prints the EU code.
   *
   * The rule itself lives in lib/country.ts, next to the country names it has
   * to recognise: `destination` is free text.
   */
  const region = customsRegion(transport.destination)
  const hsFor = (sku: string) => hsCodes[sku]?.[region] ?? ''

  /**
   * What this invoice declares: WHAT IS IN THE CONTAINER.
   *
   * Every product packed across every order on board, added up, priced the way
   * the order carrying it prices it: qty × (unit price − discount), the same
   * arithmetic the order screen uses. A part shipment is then billed at the
   * agreed price per bottle rather than at a rounded-off share.
   *
   * It used to bill one whole ORDER. Transport 20260801 handed customs a
   * packing list saying 42 bottles and an invoice saying 130 — a declared value
   * for goods that were not in the container.
   *
   * A load nobody has packed out contributes nothing, exactly as it contributes
   * nothing to the packing list. Both documents are then empty, which is the
   * truth.
   *
   * Since migration 100 the boxes belong to the TRANSPORT and are packed per
   * product, so a box need not name an order at all. `for_order_id` exists for
   * the warehouse — which boxes to hand to whom — and deliberately plays no
   * part here: a customs value follows the goods, not the box they sit in. It
   * also means a box of loose stock is still declared at the agreed price
   * instead of silently landing on the paper at zero.
   */
  const priceOf = (sku: string) => {
    for (const order of orders) {
      const line = ((order.items ?? []) as QuoteItem[]).find(l => l.sku === sku)
      if (line) return line
    }
    return undefined
  }

  const billed = new Map<string, QuoteItem>()
  for (const colli of transportColli(transport)) {
    for (const packed of colli.items) {
      if (packed.qty <= 0) continue
      const line = priceOf(packed.sku)
      const unit = line?.unit_price ?? 0
      const discount = line?.discount ?? 0
      const value = packed.qty * (unit - discount)
      const existing = billed.get(packed.sku)
      if (existing) {
        existing.qty += packed.qty
        existing.line_total = parseFloat((existing.line_total + value).toFixed(2))
      } else {
        billed.set(packed.sku, {
          sku: packed.sku,
          name: packed.name,
          qty: packed.qty,
          unit_price: unit,
          discount,
          line_total: parseFloat(value.toFixed(2)),
          tht_date: line?.tht_date,
        })
      }
    }
  }
  const activeItems = Array.from(billed.values())
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)

  /**
   * The invoice number and the currency, both from the FIRST order on board.
   *
   * Her instruction: "in gevallen dat een transport meerdere orders heeft, dat
   * de commercial invoice van het transport de eerste factuur# pakt van de
   * eerste order, anders gaat dat fout." One transport, one number, picked by a
   * rule instead of by whichever order the code happened to reach first.
   */
  const first = orders[0]
  const invoiceNumber = first?.order_number ?? transport.transport_number
  const currency = first?.currency ?? 'XCG'

  /**
   * Who receives it: the same address the packing list prints, because the two
   * papers describe one load arriving at one door. The delivery address when
   * one is picked, otherwise the warehouse, otherwise the destination.
   *
   * `label` is our own display name and never appears here — migration 096.
   */
  const drop = transport.delivery_address
  const attn = (transport.receiver_contact ?? '').trim()
    || (drop?.receiver_contact ?? '').trim()
  const consignee: string[] = (() => {
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
    return [transport.destination, attn ? `Attn. ${attn}` : ''].filter(Boolean)
  })()

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = transport.etd
    ? fmt(new Date(transport.etd + 'T12:00:00'))
    : fmt(new Date())

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={{ marginBottom: 2 }}>
          <Image src="/spika-banner.png" style={{ width: '100%', height: 101, objectFit: 'contain' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 }}>
          <Text style={styles.invoiceTitle}>COMMERCIAL INVOICE</Text>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* Exporter / Consignee */}
        <View style={styles.addressRow}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Exporter / Shipper</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{company.name}</Text>
            <Text style={styles.addressLine}>{company.address_line1}</Text>
            <Text style={styles.addressLine}>{company.address_line2}</Text>
            <Text style={styles.addressRed}>{company.email}</Text>
            <Text style={styles.addressLine}>{company.phone}</Text>
            <Text style={styles.addressLine}>CRIB# {company.crib_number}</Text>
          </View>
          {/* The address the load goes to, not the reseller who bought it —
              the same block the packing list prints. */}
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Consignee</Text>
            {consignee.map((line, i) => (
              <Text
                key={`c${i}`}
                style={i === 0 ? [styles.addressLine, { fontFamily: 'Helvetica-Bold' }] : styles.addressLine}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* Header.
            Five blocks, not seven. At seven each box was 74pt wide and both the
            labels and their values broke over two lines — "COUNTRY OF / ORIGIN",
            "August 19, / 2026". Currency came out because it already sits on
            every line below, and Order Ref because it repeated the invoice
            number. The labels themselves are untouched: at five blocks each box
            is 103pt and "COUNTRY OF ORIGIN" needs about 94pt including padding,
            so the full wording fits. Measured in the generated PDF. */}
        <View style={styles.metaRow}>
          {[
            { label: 'Invoice #',         value: invoiceNumber },
            { label: 'Transport #',       value: transport.transport_number },
            { label: 'Export Date',       value: exportDate },
            { label: 'Country of Origin', value: 'Curaçao' },
            { label: 'Carrier',           value: transport.carrier?.name ?? '' },
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Items table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>DESCRIPTION OF GOODS</Text>
          <Text style={[styles.thText, styles.colHs]}>HS CODE</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
          <Text style={[styles.thText, styles.colUnit]}>UNIT PRICE</Text>
          <Text style={[styles.thText, styles.colTotal]}>TOTAL</Text>
        </View>

        {activeItems.map((item, i) => (
          <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <View style={styles.colDesc}>
              <Text style={styles.tdText}>{item.name}</Text>
              {item.tht_date && (
                <Text style={{ fontSize: 7, color: GRAY, marginTop: 1 }}>
                  {[
                    `THT: ${formatTht(item.tht_date)}`,
                    batchLabel(batches, item.sku) ? `Batch: ${batchLabel(batches, item.sku)}` : '',
                  ].filter(Boolean).join('   ·   ')}
                </Text>
              )}
            </View>
            {/* The code for THIS destination. A product with none set for it
                prints an empty cell — her rule: what is not filled in stays
                empty, and the column stays because it does get filled in. */}
            <Text style={[styles.tdText, styles.colHs]}>{hsFor(item.sku)}</Text>
            <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
            <Text style={[styles.tdText, styles.colUnit]}>{currency} {item.unit_price.toFixed(2)}</Text>
            <Text style={[styles.tdText, styles.colTotal]}>{currency} {item.line_total.toFixed(2)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={[styles.totalRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: BORDER }]}>
            <Text style={styles.grandLabel}>TOTAL VALUE</Text>
            <Text style={styles.grandValue}>{currency} {subtotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Certification */}
        <View style={styles.certSection}>
          <Text style={[styles.certText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>
            Declaration / Certification
          </Text>
          <Text style={styles.certText}>
            I/We hereby certify that the information on this invoice is true and correct and that the contents
            of this shipment are as stated above. The goods described herein are of Curaçao origin.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 20, gap: 40 }}>
            <View style={{ flex: 1 }}>
              <Svg height={1}><Line x1={0} y1={0} x2={180} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.certText, { marginTop: 4 }]}>Authorised Signature</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Svg height={1}><Line x1={0} y1={0} x2={180} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.certText, { marginTop: 4 }]}>Date</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
