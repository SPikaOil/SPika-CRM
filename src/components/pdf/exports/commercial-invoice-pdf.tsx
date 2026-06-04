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
import { Export, QuoteItem } from '@/types'
import { CompanyInfo } from '../delivery-note-pdf'
import { formatTaxId } from '@/lib/tax-id'

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
  invoiceTitle: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
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

interface Props {
  exportRecord: Export
  company?: CompanyInfo
}

export function CommercialInvoicePDF({ exportRecord, company = DEFAULT_COMPANY }: Props) {
  const order = exportRecord.order as any
  const customer = (order?.customer ?? (exportRecord as any).customer) as any
  const items: QuoteItem[] = (order?.items ?? exportRecord.items ?? []) as QuoteItem[]
  const activeItems = items.filter(i => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const currency = exportRecord.currency ?? 'XCG'

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = exportRecord.export_date
    ? fmt(new Date(exportRecord.export_date + 'T12:00:00'))
    : fmt(new Date())

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={{ marginBottom: 10, alignItems: 'center' }}>
          <Image src="/spika-banner.png" style={{ width: '96%', height: 80, objectFit: 'contain' }} />
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
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Consignee / Buyer</Text>
            <Text style={[styles.addressLine, { fontFamily: 'Helvetica-Bold' }]}>
              {customer?.company_name ?? '—'}
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
            {(() => {
              const taxId = formatTaxId(
                (customer?.billing_address as any)?.country ?? '',
                customer?.vat_number,
                customer?.crib_number,
              )
              return taxId ? <Text style={styles.addressLine}>{taxId}</Text> : null
            })()}
            <Text style={styles.addressLine}>Destination: {exportRecord.destination || '—'}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          {[
            { label: 'Invoice #',    value: exportRecord.export_number },
            { label: 'Order Ref',    value: order?.order_number ?? '—' },
            { label: 'Export Date',  value: exportDate },
            { label: 'Currency',     value: currency },
            { label: 'Country of Origin', value: 'Curaçao' },
            { label: 'Carrier',      value: exportRecord.carrier?.name ?? '—' },
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
            <Text style={[styles.tdText, styles.colDesc]}>{item.name}</Text>
            <Text style={[styles.tdText, styles.colHs]}>—</Text>
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
