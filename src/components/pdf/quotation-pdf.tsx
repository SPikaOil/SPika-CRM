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
import { Quote } from '@/types'
import { formatTaxId } from '@/lib/tax-id'

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'

const B2C_TAX_RATE = 0.06

interface QuotationPDFProps {
  quote: Quote
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  docTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },

  divider: { marginVertical: 10 },

  // Addresses
  addressRow: { flexDirection: 'row', gap: 40, marginBottom: 16 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addressLine: { fontSize: 9, color: DARK, marginBottom: 1 },

  // Meta
  metaRow: { flexDirection: 'row', marginBottom: 14 },
  metaBlock: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 2 },
  metaGap: { width: 1 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, color: DARK },

  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: RED, paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: LIGHT },
  colProduct: { flex: 4 },
  colQty: { flex: 1, textAlign: 'center' },
  colRate: { flex: 1.5, textAlign: 'right' },
  colDisc: { flex: 1.5, textAlign: 'right' },
  colAmount: { flex: 1.5, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 9, color: DARK },
  tdSub: { fontSize: 7, color: GRAY },

  // Totals
  totalsSection: { alignItems: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', gap: 16, paddingVertical: 2 },
  totalLabel: { fontSize: 9, color: GRAY, textAlign: 'right', width: 120 },
  totalValue: { fontSize: 9, color: DARK, textAlign: 'right', width: 70 },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right', width: 120 },
  grandTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right', width: 70 },
  totalDivider: { height: 0.5, backgroundColor: BORDER, width: 206, marginVertical: 4 },

  // Note box
  noteBox: { marginTop: 24, padding: 12, backgroundColor: LIGHT, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: RED },
  noteTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 },
  noteText: { fontSize: 8, color: GRAY, lineHeight: 1.5 },

})

export function QuotationPDF({ quote }: QuotationPDFProps) {
  const customer = (quote as any).customer
  const isB2C = customer?.customer_category === 'b2c'
  const taxRate = isB2C ? B2C_TAX_RATE : 0

  const activeItems = (quote.items ?? []).filter((i) => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax

  const dateStr = new Date(quote.created_at ?? Date.now()).toLocaleDateString('en', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const validUntilStr = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const billingAddr = customer?.billing_address as any

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={{ marginBottom: 10, alignItems: 'center' }}>
          <Image src="/spika-banner.png" style={{ width: '96%', height: 80, objectFit: 'contain' }} />
        </View>
        <View style={styles.header}>
          <Text style={styles.docTitle}>QUOTATION</Text>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* Addresses */}
        <View style={styles.addressRow}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>From</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>Mils Inc. / SPika Oil</Text>
            <Text style={styles.addressLine}>Kaya Gilberto F. Croes 4</Text>
            <Text style={styles.addressLine}>Willemstad, Curaçao</Text>
            <Text style={styles.addressLine}>hello@spikaoil.nl</Text>
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Quotation For</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>{customer?.company_name ?? '—'}</Text>
            {customer?.contact_person ? <Text style={styles.addressLine}>{customer.contact_person}</Text> : null}
            {billingAddr?.street ? <Text style={styles.addressLine}>{billingAddr.street}</Text> : null}
            {billingAddr?.city ? (
              <Text style={styles.addressLine}>{[billingAddr.zip, billingAddr.city].filter(Boolean).join(' ')}</Text>
            ) : null}
            {billingAddr?.country ? <Text style={styles.addressLine}>{billingAddr.country}</Text> : null}
            {customer?.email ? <Text style={[styles.addressLine, { color: RED }]}>{customer.email}</Text> : null}
            {(customer?.billing_emails ?? []).map((email: string) => (
              <Text key={email} style={[styles.addressLine, { color: RED }]}>{email}</Text>
            ))}
            {(() => {
              const taxId = formatTaxId(
                (customer?.billing_address as any)?.country ?? '',
                customer?.vat_number,
                (customer as any)?.crib_number,
              )
              return taxId ? <Text style={styles.addressLine}>{taxId}</Text> : null
            })()}
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Quote #</Text>
            <Text style={styles.metaValue}>{quote.quote_number || '—'}</Text>
          </View>
          <View style={styles.metaGap} />
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{dateStr}</Text>
          </View>
          <View style={styles.metaGap} />
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Valid Until</Text>
            <Text style={styles.metaValue}>{validUntilStr}</Text>
          </View>
          <View style={styles.metaGap} />
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>VAT</Text>
            <Text style={styles.metaValue}>{isB2C ? '6% (B2C)' : '0% (B2B)'}</Text>
          </View>
          {quote.po_number ? (
            <>
              <View style={styles.metaGap} />
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>PO Number</Text>
                <Text style={styles.metaValue}>{quote.po_number}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colProduct]}>PRODUCT</Text>
          <Text style={[styles.thText, styles.colQty]}>QTY</Text>
          <Text style={[styles.thText, styles.colRate]}>UNIT PRICE</Text>
          <Text style={[styles.thText, styles.colDisc]}>DISCOUNT</Text>
          <Text style={[styles.thText, styles.colAmount]}>AMOUNT</Text>
        </View>

        {/* Rows */}
        {activeItems.map((item, i) => (
          <View key={item.sku} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <View style={styles.colProduct}>
              <Text style={styles.tdText}>{item.name}</Text>
              <Text style={styles.tdSub}>{item.sku}</Text>
            </View>
            <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
            <Text style={[styles.tdText, styles.colRate]}>XCG {item.unit_price.toFixed(2)}</Text>
            <Text style={[styles.tdText, styles.colDisc]}>
              {item.discount > 0 ? `XCG ${item.discount.toFixed(2)}` : '—'}
            </Text>
            <Text style={[styles.tdText, styles.colAmount]}>XCG {item.line_total.toFixed(2)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>XCG {subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isB2C ? 'VAT (6%)' : 'VAT (0% — B2B exempt)'}</Text>
            <Text style={styles.totalValue}>XCG {tax.toFixed(2)}</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>XCG {total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Note */}
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>IMPORTANT NOTE</Text>
          <Text style={styles.noteText}>
            This is a quotation only — no payment is required at this stage. All prices are valid until {validUntilStr}.
            To confirm your order, please contact us via WhatsApp or email. This document does not constitute an invoice.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
