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
import { transportCargo, transportItemTotals } from '@/lib/transport-cargo'
import { CompanyInfo } from '../delivery-note-pdf'
import { addressLines, isEuropeanAddress } from '@/lib/address'

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
  subtitle: { fontSize: 10, color: GRAY, textAlign: 'right', marginTop: 2 },
  divider: { marginVertical: 10 },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  box: { padding: 8, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2, marginBottom: 4 },
  boxLine: { fontSize: 9, color: DARK, marginBottom: 1 },
  boxRed: { fontSize: 9, color: RED, marginBottom: 1 },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  col: { flex: 1 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, marginBottom: 14 },
  metaBlock: { width: '33.33%', backgroundColor: LIGHT, padding: 8 },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, color: DARK },
  tableHeader: { flexDirection: 'row', backgroundColor: RED, paddingVertical: 5, paddingHorizontal: 6, marginTop: 10 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: LIGHT },
  colDesc: { flex: 4 },
  colPkgs: { flex: 1.5, textAlign: 'center' },
  colWeight: { flex: 1.5, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase' },
  tdText: { fontSize: 9, color: DARK },
  signArea: { marginTop: 20, flexDirection: 'row', gap: 20 },
  signBlock: { flex: 1 },
  signLine: { marginTop: 30 },
  signLabel: { fontSize: 8, color: GRAY, marginTop: 4 },
  noticeBox: { marginTop: 12, padding: 8, backgroundColor: LIGHT, borderRadius: 2 },
  noticeText: { fontSize: 7, color: GRAY, lineHeight: 1.5 },
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
  /** One B/L per transport — the carrier receives the whole load, not one order. */
  transport: Transport
  company?: CompanyInfo
}

export function DonAndresBLPDF({ transport, company = DEFAULT_COMPANY }: Props) {
  // A transport goes to one address, so the consignee is taken from its first
  // order; the cargo is every order on board, added up.
  const order = (transport.orders ?? [])[0] as any
  const customer = order?.customer as any
  const items = transportItemTotals(transport) as unknown as QuoteItem[]
  const cargo = transportCargo(transport)
  const activeItems = items.filter(i => i.qty > 0)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  const exportDate = transport.etd
    ? fmt(new Date(transport.etd + 'T12:00:00'))
    : fmt(new Date())

  const totalQty = activeItems.reduce((sum, i) => sum + i.qty, 0)
  // Packages and weight come from the real packing, never from a bottle count.
  const totalColli = cargo.colli
  const totalWeight = cargo.weight

  const isDonAndres = transport.carrier?.bl_template === 'don_andres'
  const portOfDischarge = transport.destination || (isDonAndres ? 'Bonaire' : '—')

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={{ marginBottom: 2 }}>
          <Image src="/spika-banner.png" style={{ width: '100%', height: 101, objectFit: 'contain' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 }}>
          <View>
            <Text style={styles.title}>BILL OF LADING</Text>
            <Text style={styles.subtitle}>{transport.carrier?.name ??'Carrier'}</Text>
          </View>
        </View>

        <Svg height={1} style={styles.divider}>
          <Line x1={0} y1={0} x2={515} y2={0} strokeWidth={1} stroke={RED} />
        </Svg>

        {/* Shipper / Consignee */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Shipper</Text>
            <View style={styles.box}>
              <Text style={[styles.boxLine, { fontFamily: 'Helvetica-Bold' }]}>{company.name}</Text>
              <Text style={styles.boxLine}>{company.address_line1}</Text>
              <Text style={styles.boxLine}>{company.address_line2}</Text>
              <Text style={styles.boxRed}>{company.email}</Text>
              <Text style={styles.boxLine}>{company.phone}</Text>
              <Text style={styles.boxLine}>CRIB# {company.crib_number}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Consignee</Text>
            <View style={styles.box}>
              <Text style={[styles.boxLine, { fontFamily: 'Helvetica-Bold' }]}>
                {customer?.company_name ?? '—'}
              </Text>
              <Text style={styles.boxLine}>{customer?.contact_person ?? ''}</Text>
              {/* Shared layout — see lib/address.ts */}
              {addressLines(customer?.billing_address as any, isEuropeanAddress(customer?.billing_address as any)).map((line, i) => (
                <Text key={`b${i}`} style={styles.boxLine}>{line}</Text>
              ))}
              {customer?.phone && <Text style={styles.boxLine}>{customer.phone}</Text>}
            </View>
          </View>
        </View>

        {/* Notify Party (same as consignee) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notify Party</Text>
          <View style={styles.box}>
            <Text style={styles.boxLine}>Same as Consignee</Text>
          </View>
        </View>

        {/* Voyage meta */}
        <View style={styles.metaGrid}>
          {[
            { label: 'B/L Number',        value: transport.transport_number },
            { label: 'Export Date',        value: exportDate },
            { label: 'Order Reference',    value: order?.order_number ?? '—' },
            { label: 'Port of Loading',    value: 'Willemstad, Curaçao' },
            { label: 'Port of Discharge',  value: portOfDischarge },
            { label: 'Carrier',            value: transport.carrier?.name ?? '—' },
          ].map(({ label, value }) => (
            <View key={label} style={styles.metaBlock}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Cargo description table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colDesc]}>DESCRIPTION OF PACKAGES & GOODS</Text>
          <Text style={[styles.thText, styles.colPkgs]}>NO. OF PKGS</Text>
          <Text style={[styles.thText, styles.colWeight]}>GROSS WEIGHT</Text>
        </View>

        {/* Goods are listed per product; packages and weight are properties of
            the load as a whole, so they are stated once in the totals row. */}
        {activeItems.map((item, i) => (
          <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <Text style={[styles.tdText, styles.colDesc]}>
              {item.name} ({item.qty} bottles)
            </Text>
            <Text style={[styles.tdText, styles.colPkgs]}>—</Text>
            <Text style={[styles.tdText, styles.colWeight]}>—</Text>
          </View>
        ))}

        {/* Totals row */}
        <View style={[styles.tableRow, { backgroundColor: LIGHT }]}>
          <Text style={[styles.tdText, styles.colDesc, { fontFamily: 'Helvetica-Bold' }]}>
            TOTAL — {totalQty} bottles
          </Text>
          <Text style={[styles.tdText, styles.colPkgs, { fontFamily: 'Helvetica-Bold' }]}>
            {totalColli} colli
          </Text>
          <Text style={[styles.tdText, styles.colWeight, { fontFamily: 'Helvetica-Bold' }]}>
            {totalWeight === null ? '—' : `${totalWeight.toFixed(2)} kg`}
          </Text>
        </View>

        {/* Signature area */}
        <View style={styles.signArea}>
          <View style={styles.signBlock}>
            <Text style={styles.sectionLabel}>Shipped on Board</Text>
            <View style={styles.box}>
              <Text style={styles.boxLine}>Date: {exportDate}</Text>
              <Text style={[styles.boxLine, { marginTop: 4 }]}>
                Place: Willemstad, Curaçao
              </Text>
            </View>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.sectionLabel}>Signed for the Carrier</Text>
            <View style={[styles.box, { minHeight: 60 }]}>
              <Text style={styles.boxLine}>{transport.carrier?.name ??'—'}</Text>
              <View style={{ marginTop: 24 }}>
                <Svg height={1}><Line x1={0} y1={0} x2={160} y2={0} strokeWidth={0.5} stroke={BORDER} /></Svg>
                <Text style={styles.signLabel}>Authorised Signature</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notice */}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            RECEIVED by the Carrier, the goods or packages said to contain goods herein mentioned, in apparent good order
            and condition unless otherwise stated, to be transported to the place of delivery mentioned above.
            In accepting this Bill of Lading, the shipper, consignee and owner agree to be bound by its terms and conditions.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
