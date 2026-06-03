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

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f5'
const BORDER = '#dddddd'

const BOTTLES_PER_CARTON = 12
const KG_PER_CARTON = 5

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
  },
  divider: { marginVertical: 8 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: RED },
  refBox: { backgroundColor: DARK, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 3 },
  refText: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },

  // Address section
  addressRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  addressBox: { flex: 1, padding: 10, borderWidth: 0.5, borderColor: BORDER, borderRadius: 3 },
  addressBoxTo: { flex: 1.6, padding: 10, borderWidth: 2, borderColor: RED, borderRadius: 3 },
  addressLabel: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
  },
  addressLabelTo: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: RED,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
  },
  addressName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  addressLine: { fontSize: 9, color: DARK, marginBottom: 1 },
  addressCountry: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: RED, marginTop: 4 },

  // Info grid
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  infoBox: { flex: 1, backgroundColor: LIGHT, padding: 8, borderRadius: 3, alignItems: 'center' },
  infoLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK },
  infoSub: { fontSize: 8, color: GRAY, marginTop: 1 },

  // Items table
  tableHeader: { flexDirection: 'row', backgroundColor: RED, paddingVertical: 4, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: LIGHT },
  thText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 8.5, color: DARK },
  colDesc: { flex: 4 },
  colTht: { flex: 2.5, textAlign: 'center' },
  colQty: { flex: 1.5, textAlign: 'center' },
  colCtns: { flex: 1.5, textAlign: 'center' },

  // Footer
  footer: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerNote: { fontSize: 7.5, color: GRAY, flex: 1 },
  footerCarrier: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },
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

export function ShippingLabelPDF({ exportRecord, company = DEFAULT_COMPANY }: Props) {
  const order = exportRecord.order as any
  const customer = (order?.customer ?? (exportRecord as any).customer) as any
  const items: QuoteItem[] = (order?.items ?? exportRecord.items ?? []) as QuoteItem[]
  const activeItems = items.filter(i => i.qty > 0)

  const totalQty = activeItems.reduce((sum, i) => sum + i.qty, 0)
  const totalCartons = Math.ceil(totalQty / BOTTLES_PER_CARTON)
  const totalWeight = totalCartons * KG_PER_CARTON

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })

  const exportDate = exportRecord.export_date
    ? fmt(new Date(exportRecord.export_date + 'T12:00:00'))
    : fmt(new Date())

  const billingAddr = customer?.billing_address ?? {}
  const deliveryAddr = customer?.delivery_address ?? {}
  const shipToAddr = deliveryAddr?.street ? deliveryAddr : billingAddr

  const carrier = (exportRecord as any).carrier
  const destination = exportRecord.destination || billingAddr?.country || '—'

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Logo */}
        <View style={{ marginBottom: 8, alignItems: 'center' }}>
          <Image src="/spika-banner.png" style={{ width: '90%', height: 64, objectFit: 'contain' }} />
        </View>

        {/* Title + Reference */}
        <View style={styles.header}>
          <Text style={styles.title}>SHIPPING LABEL</Text>
          <View style={styles.refBox}>
            <Text style={styles.refText}>{exportRecord.export_number}</Text>
          </View>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={531} y2={0} strokeWidth={1.5} stroke={RED} />
        </Svg>

        {/* FROM / TO */}
        <View style={styles.addressRow}>
          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>Ship From</Text>
            <Text style={styles.addressName}>{company.name}</Text>
            <Text style={styles.addressLine}>{company.address_line1}</Text>
            <Text style={styles.addressLine}>{company.address_line2}</Text>
            <Text style={styles.addressLine}>{company.phone}</Text>
            <Text style={[styles.addressLine, { color: RED }]}>{company.email}</Text>
          </View>
          <View style={styles.addressBoxTo}>
            <Text style={styles.addressLabelTo}>Ship To</Text>
            <Text style={styles.addressName}>{customer?.company_name ?? '—'}</Text>
            {customer?.contact_person ? (
              <Text style={styles.addressLine}>{customer.contact_person}</Text>
            ) : null}
            {shipToAddr?.street ? <Text style={styles.addressLine}>{shipToAddr.street}</Text> : null}
            {shipToAddr?.city ? <Text style={styles.addressLine}>{shipToAddr.city}</Text> : null}
            {shipToAddr?.state ? <Text style={styles.addressLine}>{shipToAddr.state}</Text> : null}
            {shipToAddr?.zip ? <Text style={styles.addressLine}>{shipToAddr.zip}</Text> : null}
            <Text style={styles.addressCountry}>{destination.toUpperCase()}</Text>
          </View>
        </View>

        {/* Key info grid */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Export Date</Text>
            <Text style={[styles.infoValue, { fontSize: 10 }]}>{exportDate}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Total Bottles</Text>
            <Text style={styles.infoValue}>{totalQty}</Text>
            <Text style={styles.infoSub}>bottles</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Total Cartons</Text>
            <Text style={styles.infoValue}>{totalCartons}</Text>
            <Text style={styles.infoSub}>cartons</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Gross Weight</Text>
            <Text style={styles.infoValue}>{totalWeight}</Text>
            <Text style={styles.infoSub}>kg</Text>
          </View>
          {carrier && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Carrier</Text>
              <Text style={[styles.infoValue, { fontSize: 9 }]}>{carrier.name}</Text>
              {carrier.route ? <Text style={styles.infoSub}>{carrier.route}</Text> : null}
            </View>
          )}
        </View>

        {/* Items + THT */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>Product</Text>
          <Text style={[styles.thText, styles.colTht]}>THT / Best Before</Text>
          <Text style={[styles.thText, styles.colQty]}>Qty (btls)</Text>
          <Text style={[styles.thText, styles.colCtns]}>Cartons</Text>
        </View>
        {activeItems.map((item, i) => {
          const ctns = Math.ceil(item.qty / BOTTLES_PER_CARTON)
          const thtStr = (item as any).tht_date
            ? fmt(new Date((item as any).tht_date + 'T12:00:00'))
            : ((exportRecord as any).tht_date
              ? fmt(new Date((exportRecord as any).tht_date + 'T12:00:00'))
              : '—')
          return (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tdText, styles.colDesc]}>{item.name}</Text>
              <Text style={[styles.tdText, styles.colTht]}>{thtStr}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{item.qty}</Text>
              <Text style={[styles.tdText, styles.colCtns]}>{ctns}</Text>
            </View>
          )
        })}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            Handle with care · Do not expose to direct sunlight or heat · Keep upright
          </Text>
          <Text style={styles.footerCarrier}>
            {carrier ? `${carrier.name}${carrier.route ? `  ·  ${carrier.route}` : ''}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
