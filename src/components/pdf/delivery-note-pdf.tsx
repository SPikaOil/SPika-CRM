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
// No hyphens in any of this app's documents: importing this registers the
// callback that tells react-pdf a word may never be cut in half. A name
// printed as "Canarbo Epicu-" and "rian Market" is what started it.
import '@/lib/pdf-text'
import { Order, QuoteItem } from '@/types'
import { formatTaxId } from '@/lib/tax-id'
import { addressLines, isEuropeanAddress } from '@/lib/address'
import { taxLineLabel, outOfScopeLabel, exportTaxNote, taxRateFor } from '@/lib/tax-names'
import { formatTht } from '@/lib/utils'
import { batchLabel, type OrderBatches } from '@/lib/order-batches'

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'

/**
 * What a field says when there is nothing to put in it: nothing.
 *
 * Her decision of 2026-08-19 — "als niet ingevuld laat leeg staan". The label
 * stays on the document and the value is simply blank, because these fields do
 * get filled in.
 *
 * It replaces an em dash, which never printed anyway: the standard Helvetica
 * these documents use has no glyph for it, so react-pdf drew nothing at all and
 * the field already read as blank — by accident rather than on purpose. A
 * constant so this stays one decision in one place.
 */
const NONE = ''

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 40,
  },

  // ── Header ──
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  brandBlock: { flexDirection: 'column', gap: 2 },
  brandName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: GRAY, letterSpacing: 2 },
  invoiceTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
  // Same weight and colour as the invoice title, smaller because the phrase is
  // long and shares the line with the CONSIGNMENT tag.
  consignmentTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
  // Consignment marker, next to the document title. Outlined rather than filled
  // so it reads as a status, not as part of the SPika wordmark.
  consignmentTag: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    letterSpacing: 1,
    borderWidth: 0.75,
    borderColor: DARK,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  divider: { marginVertical: 5 },

  // ── From / Bill To ──
  addressRow: { flexDirection: 'row', gap: 40, marginBottom: 10 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addressLine: { fontSize: 9, color: DARK, marginBottom: 1 },
  addressRed: { fontSize: 9, color: RED, marginBottom: 1 },

  // ── Meta table ──
  metaRow: { flexDirection: 'row', gap: 0, marginBottom: 10 },
  /**
   * A meta box is a THIRD of the width and the row wraps — never "as many as
   * fit on one line".
   *
   * Six boxes on 515pt left 70pt of room for the value, and "September 30,
   * 2026" measures 81.3pt in Helvetica at 9. So the date broke over two lines
   * on any invoice in the long months, which is what she kept seeing.
   *
   * Measured across all twelve months rather than the one in front of me:
   * September is the widest at 81.3pt, then November and December at 78.8,
   * down to July at 53.3. With padding a box therefore needs 97.3pt at the
   * very least. A third of the width is 171.7pt, so 155.7pt of room — twice
   * what the worst month asks for, and it stays true whatever gets added to
   * this row later.
   */
  // ONE row, always — her instruction of 2026-09-08. The boxes fit because the
  // VALUE is 7.5pt, not because the row may break. Six boxes on 515pt leave
  // 69.8pt; "September 30, 2026" is the widest date of the year and is 81.3pt
  // at 9pt, which is what broke, and 67.7pt at 7.5. Six is the most this row
  // ever holds, the sixth being the PO number that tipped invoice 729160 over.
  metaBlock: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 2 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 7.5, color: DARK },

  // ── Product table ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: RED,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  colProduct: { flex: 4 },
  colQty:     { flex: 1, textAlign: 'center' },
  colRate:    { flex: 1.5, textAlign: 'right' },
  colDisc:    { flex: 1.5, textAlign: 'right' },
  colAmount:  { flex: 1.5, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 9, color: DARK },

  // ── Totals ──
  totalsSection: { alignItems: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', gap: 16, paddingVertical: 2 },
  // 160, not 100: "BTW (0% — BTW exempt)" is 21 characters and broke onto a
  // second line at 100pt. Her rule of 2026-11-06: no stacked text on an
  // invoice. Same width as taxNoteLabel below, which already sits in this
  // block without wrapping.
  totalLabel: { fontSize: 9, color: GRAY, textAlign: 'right', width: 160 },
  totalValue: { fontSize: 9, color: DARK, textAlign: 'right', width: 80 },
  balanceDueLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', width: 100 },
  // Wider and smaller than BALANCE DUE: the sentence is 56 characters and would
  // otherwise wrap into the amount beside it.
  consignmentValueLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', width: 240 },
  taxNoteLabel: { fontSize: 9, color: GRAY, textAlign: 'right', width: 160 },
  balanceDueValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right', width: 120 },
  outOfScope: { fontSize: 7, color: GRAY, textAlign: 'right', marginTop: 2 },

  // ── Bank details ──
  bankSection: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 8 },
  bankTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6 },
  bankLine: { fontSize: 8, color: GRAY, marginBottom: 1 },
  bankRed: { fontSize: 8, color: RED },

  // ── Signed PDF note ──
  signedNote: { marginTop: 20, padding: 8, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2 },
  signedNoteText: { fontSize: 8, color: GRAY },

  // ── Footer ──
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40 },
  footerText: { fontSize: 7, color: GRAY, textAlign: 'center' },
})

export interface CompanyInfo {
  name: string
  address_line1: string
  address_line2: string
  email: string
  phone: string
  crib_number: string
  coc_number: string
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Mils Inc.',
  address_line1: 'Kaya Kiwa 31-a',
  address_line2: 'Willemstad Curacao CW',
  email: 'hello@spikaoil.nl',
  phone: '5999-6896969',
  crib_number: '102471812',
  coc_number: '145141',
}

interface Props {
  order: Order & { customer?: any; assigned_user?: any }
  signatureDataUrl?: string
  tableBottlesReturned?: number
  tableBottlesNotes?: string
  signerName?: string
  deliveryPhotoDataUrl?: string
  showPrices?: boolean
  company?: CompanyInfo
  documentType?: 'DELIVERY NOTE' | 'INVOICE' | 'CREDIT NOTE'
  /** The invoice this credit note corrects — printed on the document. */
  creditOfNumber?: string
  /** Batch numbers per sku, read from the stock movements. Empty prints nothing. */
  batches?: OrderBatches
}

export function DeliveryNotePDF({ order, signatureDataUrl, tableBottlesReturned, tableBottlesNotes, signerName, deliveryPhotoDataUrl, showPrices = true, company = DEFAULT_COMPANY, documentType = 'DELIVERY NOTE', creditOfNumber, batches }: Props) {
  const currency = (order as any).currency ?? 'XCG'
  const fmtCur = (amount: number) => `${currency} ${amount.toFixed(2)}`

  // A credit note is stored with negative quantities and a negative total —
  // that is what makes every sum in the app come out right. On paper the
  // customer should read positive quantities under a heading that says CREDIT,
  // so the figures are flipped for display only.
  const isCreditNote = documentType === 'CREDIT NOTE' || (order as any).order_type === 'credit_note'
  const rawItems = (order.items ?? []) as QuoteItem[]
  const items = isCreditNote
    ? rawItems.map(i => ({
        ...i,
        qty: Math.abs(Number(i.qty) || 0),
        line_total: Math.abs(Number(i.line_total) || 0),
      }))
    : rawItems
  const customer = order.customer
  // The address layout follows the DESTINATION, not the money — the same rule
  // the quotation, the shipping label and the three export documents now use.
  // For every customer on file today this gives the identical result to keying
  // it off the euro; it only differs the day a Dutch customer is billed in
  // guilders, where the country is the right answer and the currency is not.
  const europeanAddress = isEuropeanAddress(customer?.billing_address as any)
  const isB2C = customer?.customer_category === 'b2c'
  const taxRate = taxRateFor(customer?.customer_category)
  const returnPrice = customer?.table_bottle_return_price ?? 2.50
  // If the return is already embedded in order items (pre-delivery estimate), skip the special row
  const returnInItems = items.some(i => (i as any).sku === 'oil-30ml-table-return' && i.qty < 0)
  const effectiveBottlesReturned = returnInItems ? 0 : (tableBottlesReturned ?? 0)
  const bottleCredit = effectiveBottlesReturned > 0 ? effectiveBottlesReturned * returnPrice : 0
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax - bottleCredit

  const today = new Date()

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  // Invoice date: explicit invoice_date field, fallback to planned_date, fallback to today
  const paymentTermDays = customer?.payment_term_days ?? 7
  const invoiceDateRaw = (order as any).invoice_date ?? order.planned_date
  const invoiceDateObj = invoiceDateRaw ? new Date(invoiceDateRaw + 'T12:00:00') : today
  const dueDate = new Date(invoiceDateObj)
  dueDate.setDate(invoiceDateObj.getDate() + paymentTermDays)

  // Consignment: the goods stay SPika's until the customer sells them, so there
  // is no payment term and therefore no due date. The revenue still lands on the
  // delivery date like any other order — only the chase for payment is absent.
  // Stamped on the order at insert (migration 042), so history stays correct
  // even if the customer later becomes a normal payer.
  const isConsignment = !!(order as any).is_consignment

  const isInvoice = documentType === 'INVOICE'
  // A cash sale: the paper says "Cash Payment" instead of naming the buyer.
  // The order stays attached to the customer everywhere else in the app.
  const isCashInvoice = (order as any).cash_invoice === true
  /**
   * The tussentijdse afrekening: a PERIOD INVOICE raised against a consignment
   * note for goods the customer has now sold.
   *
   * Danique, 2026-11-06: "een tussen factuur van consignatie is een factuur."
   * It is payable, so it carries a due date, a plain Total and no delivery
   * address — the goods left on the consignment note, not on this paper.
   *
   * It needs its own flag because migration 042's trigger stamps
   * is_consignment from the CUSTOMER on every insert, so this invoice arrives
   * flagged as consignment however it was created. order_type is the only thing
   * that tells the two documents apart.
   */
  const isPeriodSettlement = (order as any).order_type === 'consignment_invoice'

  // Only the INVOICE of a consignment order changes character — and only the
  // NOTE, never the period invoice above. A delivery note is already an
  // afleverbon and keeps its own title and wording.
  const isConsignmentInvoice = isConsignment && isInvoice && !isPeriodSettlement
  const dateLabel = isInvoice ? 'Invoice Date' : 'Delivery Date'
  const dateValue = isInvoice
    ? fmt(invoiceDateObj)
    : (order.planned_date ? fmt(new Date(order.planned_date + 'T12:00:00')) : fmt(today))

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={{ marginBottom: 2 }}>
          <Image src="/spika-banner.png" style={{ width: '100%', height: 101, objectFit: 'contain' }} />
        </View>
        <View style={[styles.header, { justifyContent: 'flex-end', alignItems: 'center', gap: 8 }]}>
          {/* Not on the period invoice: that one is an ordinary payable
              invoice, and a CONSIGNMENT banner on it says the opposite. */}
          {isConsignmentInvoice && <Text style={styles.consignmentTag}>CONSIGNMENT</Text>}
          {/* On consignment the document is not an invoice at all — nothing is
              claimable on delivery — so it is titled for what it is. The
              delivery note keeps its own title; only the INVOICE variant is
              renamed. Set smaller than the 20pt title because the phrase is
              four times as long and has to sit beside the tag. */}
          <Text style={isConsignmentInvoice ? styles.consignmentTitle : styles.invoiceTitle}>
            {isCreditNote ? 'CREDIT NOTE' : isConsignmentInvoice ? 'CONSIGNMENT NOTE' : documentType}
          </Text>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* ── From / Bill To / Ship To ── */}
        {(() => {
          const ba = customer?.billing_address as any
          const da = customer?.delivery_address as any
          const hasDifferentDelivery = da?.street && (
            da.street !== ba?.street ||
            da.city !== ba?.city ||
            da.zip !== ba?.zip ||
            da.country !== ba?.country
          )
          const taxId = formatTaxId(ba?.country ?? '', customer?.vat_number, customer?.crib_number)
          return (
            <View style={[styles.addressRow, { gap: hasDifferentDelivery ? 20 : 40 }]}>
              {/* From */}
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>From</Text>
                <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{company.name}</Text>
                <Text style={styles.addressLine}>{company.address_line1}</Text>
                <Text style={styles.addressLine}>{company.address_line2}</Text>
                <Text style={styles.addressRed}>{company.email}</Text>
                <Text style={styles.addressLine}>{company.phone}</Text>
                <Text style={styles.addressLine}>Crib#{company.crib_number} | CoC#{company.coc_number}</Text>
              </View>
              {/* Bill To — or, for a cash sale, nothing about the buyer at all.
                  Naming the customer in one place and hiding them in another
                  would defeat the point, so the whole block is replaced and the
                  Ship To block below is dropped as well. */}
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Bill To</Text>
                {isCashInvoice ? (
                  <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>Cash Payment</Text>
                ) : (
                  <>
                    <Text style={[styles.addressRed, { fontFamily: 'Helvetica-Bold' }]}>SPika Reseller</Text>
                    <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{customer?.company_name ?? ''}</Text>
                    {/* No contact person on the invoice — company, address and e-mail only */}
                    {addressLines(ba, europeanAddress).map((line, i) => (
                      <Text key={`b${i}`} style={styles.addressLine}>{line}</Text>
                    ))}
                    {taxId ? <Text style={styles.addressLine}>{taxId}</Text> : null}
                    {customer?.coc_number ? <Text style={styles.addressLine}>CoC: {customer.coc_number}</Text> : null}
                    {customer?.email ? <Text style={styles.addressRed}>{customer.email}</Text> : null}
                    {(customer?.billing_emails ?? []).map((email: string) => (
                      <Text key={email} style={styles.addressRed}>{email}</Text>
                    ))}
                  </>
                )}
              </View>
              {/* Ship To — only when different from billing, never on a cash
                  sale, and never on a consignment period invoice: that is a
                  bill for goods already handed over on the note, so an
                  afleveradres on it is wrong. Her rule of 2026-11-06. */}
              {hasDifferentDelivery && !isCashInvoice && !isPeriodSettlement && (
                <View style={styles.addressBlock}>
                  <Text style={styles.addressLabel}>Ship To</Text>
                  <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{customer?.company_name ?? ''}</Text>
                  {addressLines(da, europeanAddress).map((line, i) => (
                    <Text key={`s${i}`} style={styles.addressLine}>{line}</Text>
                  ))}
                </View>
              )}
            </View>
          )
        })()}

        {/* ── Meta ── */}
        <View style={styles.metaRow}>
          {[
            { label: isCreditNote ? 'Credit Note #' : 'Invoice #', value: order.order_number },
            { label: isCreditNote ? 'Credit Date' : dateLabel,    value: dateValue },
            // A credit note owes nothing and refers back to the invoice it
            // corrects. A consignment NOTE has no due date either — nothing is
            // claimable until the goods are sold. The period invoice that
            // settles that note is payable like any other, so it falls through
            // to Due Date and Term.
            ...(isCreditNote
              ? [{ label: 'Credit of invoice', value: creditOfNumber || NONE }]
              : isConsignmentInvoice
              ? [{ label: 'Payment', value: 'On settlement' }]
              : [
                  { label: 'Due Date', value: fmt(dueDate) },
                  { label: 'Term',     value: `${paymentTermDays} days` },
                ]),
            // No delivery date on a period invoice: the goods went out on the
            // consignment note, and this paper only settles what was sold.
            ...(isPeriodSettlement
              ? []
              : [isInvoice
                  ? { label: 'Delivery Date', value: order.planned_date ? fmt(new Date(order.planned_date + 'T12:00:00')) : fmt(today) }
                  : { label: 'Reference', value: 'SPika Oil' }]),
            ...(order.po_number ? [{ label: 'PO Number', value: order.po_number }] : []),
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* ── Product Table ── */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colProduct]}>PRODUCT / ACTIVITY</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
          {showPrices && <Text style={[styles.thText, styles.colRate]}>RETAIL PRICE</Text>}
          {showPrices && <Text style={[styles.thText, styles.colDisc]}>DISCOUNT</Text>}
          {showPrices && <Text style={[styles.thText, styles.colAmount]}>AMOUNT</Text>}
        </View>

        {items.map((item, i) => {
          /**
           * "Free of Charge" is a LABEL over the price, never an amount.
           *
           * The amount column below prints `line_total` and nothing else, so
           * the figures on an invoice always add up to the subtotal under them
           * — by construction, not because someone checked. That is the point
           * of this: on 729169 a returned table bottle (unit price 0, line
           * total -22.50) was read as free and printed as 0.00 while the
           * subtotal counted the real -22.50, so the column came to 249.60 and
           * the line under it said 227.10.
           *
           * A row is only free when it really costs nothing: no unit price AND
           * no line total.
           */
          const isFree = item.unit_price === 0 && item.qty > 0 && (item.line_total ?? 0) === 0
          return (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colProduct}>
                <Text style={styles.tdText}>{item.name}</Text>
                {/* THT and batch on ONE line under the product, not stacked:
                    two thin lines per row pushed a long invoice onto a second
                    page for nothing.
                    Batch traceability is ours to carry (art. 10.3), and a
                    customer can only quote the batch on a complaint (art. 2.5)
                    if it is printed. One product can name two batches when the
                    first ran out mid-pick. */}
                {(item.tht_date || batchLabel(batches, item.sku)) && (
                  /* Smaller, italic and red — her instruction of 2026-09-07.
                     It is a note under the product, not a line of the invoice,
                     and it should not take up half the row. Helvetica-Oblique
                     is one of the fonts react-pdf carries without loading a
                     file, so this costs nothing. */
                  <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Oblique', color: RED, marginTop: 1 }}>
                    {[
                      item.tht_date ? `Best Before: ${formatTht(item.tht_date)}` : '',
                      batchLabel(batches, item.sku) ? `Batch: ${batchLabel(batches, item.sku)}` : '',
                    ].filter(Boolean).join('   ·   ')}
                  </Text>
                )}
              </View>
              <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
              {showPrices && (
                <Text style={[styles.tdText, styles.colRate, isFree ? { color: '#16a34a' } : {}]}>
                  {isFree ? 'Free of Charge' : fmtCur(item.unit_price)}
                </Text>
              )}
              {showPrices && <Text style={[styles.tdText, styles.colDisc]}>{(item.discount ?? 0) > 0 ? fmtCur(item.discount ?? 0) : NONE}</Text>}
              {/* Always the line total. No condition may ever put a different
                  number here, or the column stops adding up to the subtotal. */}
              {showPrices && <Text style={[styles.tdText, styles.colAmount, isFree ? { color: '#16a34a' } : {}]}>{fmtCur(item.line_total)}</Text>}
            </View>
          )
        })}

        {/* ── Table Bottles Returned (post-delivery special row, only when not already in items) ── */}
        {effectiveBottlesReturned > 0 && (
          <View style={[styles.tableRow, (items.length % 2 === 1) ? styles.tableRowAlt : {}]}>
            <Text style={[styles.tdText, styles.colProduct]}>
              SPika Oil - 30ml (Table Version) - Returned{tableBottlesNotes ? `\n${tableBottlesNotes}` : ''}
            </Text>
            <Text style={[styles.tdText, styles.colQty]}>-{effectiveBottlesReturned}</Text>
            {showPrices && <Text style={[styles.tdText, styles.colRate]}>{fmtCur(returnPrice)}</Text>}
            {showPrices && <Text style={[styles.tdText, styles.colDisc]}>{NONE}</Text>}
            {showPrices && <Text style={[styles.tdText, styles.colAmount]}>{fmtCur(bottleCredit)}</Text>}
          </View>
        )}

        {/* ── Totals ── */}
        {showPrices && (
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmtCur(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              {/* One tax statement, not two. A normal invoice carries both
                  "<tax> exempt" here and "Out of Scope of <tax>" below it; on a
                  consignment note only this line remains, and it says what it
                  actually is: goods leaving Curacao, no tax charged.
                  WHICH tax is named follows the CURRENCY — XCG is OB, EUR is
                  BTW, USD is VAT (lib/tax-names.ts). Her rule of 2026-11-06:
                  "valuta is leidend". A euro invoice to Rotterdam announced
                  Curacao OB until that day. */}
              <Text style={isConsignmentInvoice ? styles.taxNoteLabel : styles.totalLabel}>
                {isConsignmentInvoice
                  ? exportTaxNote(currency)
                  : taxLineLabel(currency, customer?.customer_category)}
              </Text>
              <Text style={styles.totalValue}>{fmtCur(tax)}</Text>
            </View>
            {bottleCredit > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Table Bottle Credit</Text>
                <Text style={[styles.totalValue, { color: RED }]}>- {fmtCur(bottleCredit)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: BORDER }]}>
              {/* Nothing is due on delivery under consignment — the customer
                  pays after they sell. Calling it BALANCE DUE would demand
                  money on a document that by definition demands none. */}
              <Text style={isConsignmentInvoice ? styles.consignmentValueLabel : styles.balanceDueLabel}>
                {isCreditNote
                  ? 'TOTAL CREDITED'
                  : isConsignmentInvoice
                  ? 'TOTAL CONSIGNMENT VALUE — NOT DUE ON DELIVERY'
                  // Her instruction of 2026-11-06 for the period invoice: plain
                  // "Total". It is not a balance claimed on delivery and it is
                  // not a consignment value — it is what was sold and is owed.
                  : isPeriodSettlement
                  ? 'Total'
                  : 'BALANCE DUE'}
              </Text>
              <Text style={styles.balanceDueValue}>{fmtCur(total)}</Text>
            </View>
            {/* Dropped on a consignment note: the tax line above already says it */}
            {!isConsignmentInvoice && <Text style={styles.outOfScope}>{outOfScopeLabel(currency)}</Text>}
          </View>
        )}

        {/* ── Credit reason ── */}
        {isCreditNote && (order as any).delivery_notes && (
          <View style={[styles.signedNote, { marginTop: 12 }]}>
            <Text style={[styles.signedNoteText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>
              Reason for credit
            </Text>
            <Text style={styles.signedNoteText}>{(order as any).delivery_notes}</Text>
          </View>
        )}

        {/* ── Signature area — nothing is delivered on a credit note, so there
             is nothing for the customer to sign for. ── */}
        {!isCreditNote && (
        <View style={[styles.signedNote, { marginTop: 12 }]}>
          <Text style={[styles.signedNoteText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>
            Signature / Confirmation
          </Text>
          <Text style={styles.signedNoteText}>
            By signing this document, the recipient confirms receipt of the above goods in good condition.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 40 }}>
            <View style={{ flex: 1 }}>
              {signatureDataUrl ? (
                <Image
                  src={signatureDataUrl}
                  style={{ width: 200, height: 52, objectFit: 'contain' }}
                />
              ) : (
                <View style={{ height: 52 }} />
              )}
              <Svg height={1}><Line x1={0} y1={0} x2={200} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.signedNoteText, { marginTop: 4 }]}>
                {signerName ? signerName : (signatureDataUrl ? 'Signed by customer' : 'Signature')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ height: 52 }} />
              <Svg height={1}><Line x1={0} y1={0} x2={200} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.signedNoteText, { marginTop: 4 }]}>
                {signatureDataUrl
                  // Date the goods were actually signed for — not the date this PDF was generated
                  ? fmt((order as any).delivery?.delivered_at
                      ? new Date((order as any).delivery.delivered_at)
                      : (order.planned_date ? new Date(order.planned_date + 'T12:00:00') : today))
                  : 'Date'}
              </Text>
            </View>
          </View>
        </View>
        )}

        {/* ── Bank Details ── */}
        <View style={styles.bankSection}>
          <Text style={styles.bankTitle}>Bank Details</Text>
          <Text style={styles.bankLine}>ORCO BANK N.V. — Willemstad, Curacao</Text>
          <Text style={styles.bankRed}>MilsInc</Text>
          <Text style={styles.bankLine}>Account Number: 1121280195</Text>
          <Text style={styles.bankLine}>Swift Code: ORBACWCU</Text>
        </View>

      </Page>

      {/* ── Page 2: Proof of Delivery Photo ── */}
      {deliveryPhotoDataUrl && (
        <Page size="A4" style={styles.page}>
          <View style={{ marginBottom: 2 }}>
            <Image src="/spika-banner.png" style={{ width: '100%', height: 101, objectFit: 'contain' }} />
          </View>
          <View style={[styles.header, { justifyContent: 'flex-end' }]}>
            <Text style={styles.invoiceTitle}>PROOF OF DELIVERY</Text>
          </View>
          <Svg height={1} style={styles.divider}>
            <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
          </Svg>
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 9, color: GRAY }}>Order: {order.order_number}{isCashInvoice ? '' : ` · ${order.customer?.company_name ?? ''}`} · {new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            {signerName && <Text style={{ fontSize: 9, color: GRAY, marginTop: 2 }}>Signed by: {signerName}</Text>}
          </View>
          <Image
            src={deliveryPhotoDataUrl}
            style={{ width: '100%', maxHeight: 600, objectFit: 'contain', borderRadius: 4 }}
          />
        </Page>
      )}

    </Document>
  )
}
