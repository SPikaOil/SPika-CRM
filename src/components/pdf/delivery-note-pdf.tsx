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

  // ── Header ──
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  brandBlock: { flexDirection: 'column', gap: 2 },
  brandName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: RED, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: GRAY, letterSpacing: 2 },
  invoiceTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },

  divider: { marginVertical: 10 },

  // ── From / Bill To ──
  addressRow: { flexDirection: 'row', gap: 40, marginBottom: 16 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addressLine: { fontSize: 9, color: DARK, marginBottom: 1 },
  addressRed: { fontSize: 9, color: RED, marginBottom: 1 },

  // ── Meta table ──
  metaRow: { flexDirection: 'row', gap: 0, marginBottom: 14 },
  metaBlock: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 2 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, color: DARK },

  // ── Product table ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: RED,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
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
  balanceDueValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right', width: 80 },
  outOfScope: { fontSize: 7, color: GRAY, textAlign: 'right', marginTop: 2 },

  // ── Bank details ──
  bankSection: { marginTop: 24, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 10 },
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
  documentType?: 'DELIVERY NOTE' | 'INVOICE'
}

export function DeliveryNotePDF({ order, signatureDataUrl, tableBottlesReturned, tableBottlesNotes, signerName, deliveryPhotoDataUrl, showPrices = true, company = DEFAULT_COMPANY, documentType = 'DELIVERY NOTE' }: Props) {
  const items = (order.items ?? []) as QuoteItem[]
  const customer = order.customer
  const isB2C = customer?.customer_category === 'b2c'
  const taxRate = isB2C ? 0.06 : 0
  const returnPrice = customer?.table_bottle_return_price ?? 2.50
  const bottleCredit = tableBottlesReturned && tableBottlesReturned > 0 ? tableBottlesReturned * returnPrice : 0
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax - bottleCredit

  const today = new Date()

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  // Invoice date: explicit invoice_date field, fallback to planned_date, fallback to today
  const invoiceDateRaw = (order as any).invoice_date ?? order.planned_date
  const invoiceDateObj = invoiceDateRaw ? new Date(invoiceDateRaw + 'T12:00:00') : today
  const dueDate = new Date(invoiceDateObj)
  dueDate.setDate(invoiceDateObj.getDate() + 7)

  const isInvoice = documentType === 'INVOICE'
  const dateLabel = isInvoice ? 'Invoice Date' : 'Delivery Date'
  const dateValue = isInvoice
    ? fmt(invoiceDateObj)
    : (order.planned_date ? fmt(new Date(order.planned_date + 'T12:00:00')) : fmt(today))

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={{ marginBottom: 10, alignItems: 'center' }}>
          <Image src="/spika-banner.png" style={{ width: '96%', height: 80, objectFit: 'contain' }} />
        </View>
        <View style={[styles.header, { justifyContent: 'flex-end' }]}>
          <Text style={styles.invoiceTitle}>{documentType}</Text>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* ── From / Bill To ── */}
        <View style={styles.addressRow}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>From</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{company.name}</Text>
            <Text style={styles.addressLine}>{company.address_line1}</Text>
            <Text style={styles.addressLine}>{company.address_line2}</Text>
            <Text style={styles.addressRed}>{company.email}</Text>
            <Text style={styles.addressLine}>{company.phone}</Text>
            <Text style={styles.addressLine}>Crib#{company.crib_number} | CoC#{company.coc_number}</Text>
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Bill To</Text>
            <Text style={[styles.addressRed, { fontFamily: 'Helvetica-Bold' }]}>SPika Reseller</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>
              {customer?.company_name ?? ''}
            </Text>
            <Text style={styles.addressLine}>{customer?.contact_person ?? ''}</Text>
            {customer?.billing_address?.street && (
              <Text style={styles.addressLine}>{customer.billing_address.street}</Text>
            )}
            {customer?.billing_address?.city && (
              <Text style={styles.addressLine}>
                {customer.billing_address.city}{customer.billing_address.country ? `, ${customer.billing_address.country}` : ''}
              </Text>
            )}
            {customer?.vat_number && (
              <Text style={styles.addressLine}>VAT: {customer.vat_number}</Text>
            )}
            {customer?.coc_number && (
              <Text style={styles.addressLine}>CoC: {customer.coc_number}</Text>
            )}
            {customer?.email && (
              <Text style={styles.addressRed}>{customer.email}</Text>
            )}
          </View>
        </View>

        {/* ── Meta ── */}
        <View style={styles.metaRow}>
          {[
            { label: 'Invoice #',  value: order.order_number },
            { label: dateLabel,    value: dateValue },
            { label: 'Due Date',   value: fmt(dueDate) },
            { label: 'Term',       value: '7 days' },
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
              <Text style={[styles.tdText, styles.colProduct]}>{item.name}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
              {showPrices && (
                <Text style={[styles.tdText, styles.colRate, isFree ? { color: '#16a34a' } : {}]}>
                  {isFree ? 'Free of Charge' : `XCG ${item.unit_price.toFixed(2)}`}
                </Text>
              )}
              {showPrices && <Text style={[styles.tdText, styles.colDisc]}>{isFree ? '—' : ((item.discount ?? 0) > 0 ? `XCG ${(item.discount ?? 0).toFixed(2)}` : '—')}</Text>}
              {showPrices && <Text style={[styles.tdText, styles.colAmount, isFree ? { color: '#16a34a' } : {}]}>{isFree ? 'XCG 0.00' : `XCG ${item.line_total.toFixed(2)}`}</Text>}
            </View>
          )
        })}

        {/* ── Table Bottles Returned (as line item) ── */}
        {tableBottlesReturned !== undefined && tableBottlesReturned > 0 && (
          <View style={[styles.tableRow, (items.length % 2 === 1) ? styles.tableRowAlt : {}]}>
            <Text style={[styles.tdText, styles.colProduct]}>
              SPika Oil 30ml (Table Version) — Return{tableBottlesNotes ? `\n${tableBottlesNotes}` : ''}
            </Text>
            <Text style={[styles.tdText, styles.colQty]}>-{tableBottlesReturned}</Text>
            {showPrices && <Text style={[styles.tdText, styles.colRate]}>XCG {returnPrice.toFixed(2)}</Text>}
            {showPrices && <Text style={[styles.tdText, styles.colDisc]}>—</Text>}
            {showPrices && <Text style={[styles.tdText, styles.colAmount]}>XCG {bottleCredit.toFixed(2)}</Text>}
          </View>
        )}

        {/* ── Totals ── */}
        {showPrices && (
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>XCG {subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{isB2C ? 'VAT (6%)' : 'VAT (0% — B2B exempt)'}</Text>
              <Text style={styles.totalValue}>XCG {tax.toFixed(2)}</Text>
            </View>
            {bottleCredit > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Table Bottle Credit</Text>
                <Text style={[styles.totalValue, { color: RED }]}>- XCG {bottleCredit.toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: BORDER }]}>
              <Text style={styles.balanceDueLabel}>BALANCE DUE</Text>
              <Text style={styles.balanceDueValue}>XCG {total.toFixed(2)}</Text>
            </View>
            <Text style={styles.outOfScope}>Out of Scope of OB</Text>
          </View>
        )}

        {/* ── Signature area ── */}
        <View style={[styles.signedNote, { marginTop: 24 }]}>
          <Text style={[styles.signedNoteText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>
            Signature / Confirmation
          </Text>
          <Text style={styles.signedNoteText}>
            By signing this document, the recipient confirms receipt of the above goods in good condition.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 40 }}>
            <View style={{ flex: 1 }}>
              {signatureDataUrl ? (
                <Image
                  src={signatureDataUrl}
                  style={{ width: 200, height: 64, objectFit: 'contain' }}
                />
              ) : (
                <View style={{ height: 64 }} />
              )}
              <Svg height={1}><Line x1={0} y1={0} x2={200} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.signedNoteText, { marginTop: 4 }]}>
                {signerName ? signerName : (signatureDataUrl ? 'Signed by customer' : 'Signature')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ height: 64 }} />
              <Svg height={1}><Line x1={0} y1={0} x2={200} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
              <Text style={[styles.signedNoteText, { marginTop: 4 }]}>
                {signatureDataUrl ? new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date'}
              </Text>
            </View>
          </View>
        </View>

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
          <View style={{ marginBottom: 10, alignItems: 'center' }}>
            <Image src="/spika-banner.png" style={{ width: '96%', height: 80, objectFit: 'contain' }} />
          </View>
          <View style={[styles.header, { justifyContent: 'flex-end' }]}>
            <Text style={[styles.invoiceTitle, { fontSize: 20 }]}>PROOF OF DELIVERY</Text>
          </View>
          <Svg height={1} style={styles.divider}>
            <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
          </Svg>
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 9, color: GRAY }}>Order: {order.order_number} · {order.customer?.company_name ?? ''} · {new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
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
