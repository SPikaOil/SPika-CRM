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

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  title: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: RED, textAlign: 'right' },
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

const BOTTLES_PER_CARTON = 12
const KG_PER_CARTON = 5

interface Props {
  exportRecord: Export
  company?: CompanyInfo
}

export function PackingListPDF({ exportRecord, company = DEFAULT_COMPANY }: Props) {
  const order = exportRecord.order as any
  const customer = order?.customer as any
  const items: QuoteItem[] = order?.items ?? []
  const activeItems = items.filter(i => i.qty > 0)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = exportRecord.export_date
    ? fmt(new Date(exportRecord.export_date + 'T12:00:00'))
    : fmt(new Date())

  const totalQty = activeItems.reduce((sum, i) => sum + i.qty, 0)
  const totalCartons = Math.ceil(totalQty / BOTTLES_PER_CARTON)
  const totalWeight = totalCartons * KG_PER_CARTON

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={{ marginBottom: 10, alignItems: 'center' }}>
          <Image src="/spika-banner.png" style={{ width: '96%', height: 80, objectFit: 'contain' }} />
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
            {customer?.billing_address?.street && (
              <Text style={styles.addressLine}>{customer.billing_address.street}</Text>
            )}
            {customer?.billing_address?.city && (
              <Text style={styles.addressLine}>
                {customer.billing_address.city}{customer.billing_address.country ? `, ${customer.billing_address.country}` : ''}
              </Text>
            )}
            <Text style={styles.addressLine}>Destination: {exportRecord.destination || '—'}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          {[
            { label: 'Packing List #', value: exportRecord.export_number },
            { label: 'Order Ref',      value: order?.order_number ?? '—' },
            { label: 'Export Date',    value: exportDate },
            { label: 'Carrier',        value: exportRecord.carrier?.name ?? '—' },
            { label: 'Total Cartons',  value: `${totalCartons} ctns` },
            { label: 'Gross Weight',   value: `${totalWeight} kg` },
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Items table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>PRODUCT DESCRIPTION</Text>
          <Text style={[styles.thText, styles.colQty]}>TOTAL QTY</Text>
          <Text style={[styles.thText, styles.colCartons]}>CARTONS</Text>
          <Text style={[styles.thText, styles.colWeight]}>GROSS WEIGHT</Text>
        </View>

        {activeItems.map((item, i) => {
          const cartons = Math.ceil(item.qty / BOTTLES_PER_CARTON)
          const weight = cartons * KG_PER_CARTON
          return (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tdText, styles.colDesc]}>{item.name}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{item.qty} btls</Text>
              <Text style={[styles.tdText, styles.colCartons]}>{cartons} ctns</Text>
              <Text style={[styles.tdText, styles.colWeight]}>{weight} kg</Text>
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
            <Text style={styles.summaryLabel}>Total Cartons ({BOTTLES_PER_CARTON} btls/ctn)</Text>
            <Text style={styles.summaryValue}>{totalCartons} cartons</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Weight ({KG_PER_CARTON} kg/ctn)</Text>
            <Text style={styles.summaryValue}>{totalWeight} kg</Text>
          </View>
        </View>

        {/* Marks & Numbers */}
        <View style={styles.marksBox}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
            Marks &amp; Numbers
          </Text>
          <Text style={{ fontSize: 8, color: GRAY }}>
            {customer?.company_name ?? ''}{'\n'}
            {exportRecord.destination || ''}{'\n'}
            {exportRecord.export_number} · {order?.order_number ?? ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
