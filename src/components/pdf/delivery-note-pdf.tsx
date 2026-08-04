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
import { Order, QuoteItem } from '@/types'
import { formatTaxId } from '@/lib/tax-id'
import { addressLines, isEuropeanAddress } from '@/lib/address'
import { formatTht } from '@/lib/utils'

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
  metaBlock: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 2 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, color: DARK },

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
  totalLabel: { fontSize: 9, color: GRAY, textAlign: 'right', width: 100 },
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
  email: 'd.thijm@milsinc.com',
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
}

export function DeliveryNotePDF({ order, signatureDataUrl, tableBottlesReturned, tableBottlesNotes, signerName, deliveryPhotoDataUrl, showPrices = true, company = DEFAULT_COMPANY, documentType = 'DELIVERY NOTE', creditOfNumber }: Props) {
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
  const taxRate = isB2C ? 0.06 : 0
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
  // Only the INVOICE of a consignment order changes character. A delivery note
  // is already an afleverbon and keeps its own title and wording.
  const isConsignmentInvoice = isConsignment && isInvoice
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
          {isConsignment && <Text style={styles.consignmentTag}>CONSIGNMENT</Text>}
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
              {/* Ship To — only when different from billing, and never on a cash sale */}
              {hasDifferentDelivery && !isCashInvoice && (
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
            // corrects. A consignment invoice has no due date either — nothing
            // is claimable until the goods are sold and settled.
            ...(isCreditNote
              ? [{ label: 'Credit of invoice', value: creditOfNumber || '—' }]
              : isConsignment
              ? [{ label: 'Payment', value: 'On settlement' }]
              : [
                  { label: 'Due Date', value: fmt(dueDate) },
                  { label: 'Term',     value: `${paymentTermDays} days` },
                ]),
            isInvoice
              ? { label: 'Delivery Date', value: order.planned_date ? fmt(new Date(order.planned_date + 'T12:00:00')) : fmt(today) }
              : { label: 'Reference', value: 'SPika Oil' },
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
          const isFree = item.unit_price === 0 && item.qty > 0
          return (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colProduct}>
                <Text style={styles.tdText}>{item.name}</Text>
                {item.tht_date && (
                  <Text style={{ fontSize: 7, color: GRAY, marginTop: 1 }}>
                    THT: {formatTht(item.tht_date)}
                  </Text>
                )}
              </View>
              <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
              {showPrices && (
                <Text style={[styles.tdText, styles.colRate, isFree ? { color: '#16a34a' } : {}]}>
                  {isFree ? 'Free of Charge' : fmtCur(item.unit_price)}
                </Text>
              )}
              {showPrices && <Text style={[styles.tdText, styles.colDisc]}>{isFree ? '—' : ((item.discount ?? 0) > 0 ? fmtCur(item.discount ?? 0) : '—')}</Text>}
              {showPrices && <Text style={[styles.tdText, styles.colAmount, isFree ? { color: '#16a34a' } : {}]}>{isFree ? fmtCur(0) : fmtCur(item.line_total)}</Text>}
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
            {showPrices && <Text style={[styles.tdText, styles.colDisc]}>—</Text>}
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
                  "OB exempt" here and "Out of Scope of OB" below it; on a
                  consignment note only this line remains, and it says what it
                  actually is: goods leaving Curacao, no OB charged. */}
              <Text style={isConsignmentInvoice ? styles.taxNoteLabel : styles.totalLabel}>
                {isConsignmentInvoice
                  ? 'OB 0% — export from Curacao'
                  : (isB2C ? 'OB (6%)' : 'OB (0% — OB exempt)')}
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
                  : 'BALANCE DUE'}
              </Text>
              <Text style={styles.balanceDueValue}>{fmtCur(total)}</Text>
            </View>
            {/* Dropped on a consignment note: the tax line above already says it */}
            {!isConsignmentInvoice && <Text style={styles.outOfScope}>Out of Scope of OB</Text>}
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
