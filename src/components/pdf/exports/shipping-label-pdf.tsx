import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
  Image,
} from '@react-pdf/renderer'
import { Transport } from '@/types'
import { formatPostcode, countryLabel } from '@/lib/address'
import { CompanyInfo } from '../delivery-note-pdf'
import { LabelPage } from '@/lib/transport-cargo'

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#555555'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
  },

  fromRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  fromBlock: { flex: 1 },
  fromLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  fromLine: { fontSize: 8.5, color: DARK, marginBottom: 1 },
  fromName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 1 },

  refBox: { backgroundColor: DARK, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 3 },
  refText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },

  // The colli counter is the first thing someone unloading needs to see.
  colliBox: {
    backgroundColor: RED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  colliText: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },

  divider: { marginVertical: 8 },

  shipToLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  shipToName: { fontSize: 34, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3, lineHeight: 1.1 },
  shipToLine: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2, lineHeight: 1.15 },

  contentsLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  contentsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  contentsText: { fontSize: 9, color: DARK },
  contentsWeight: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 2 },
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
  transport: Transport
  /** One entry per package. Each becomes its own page — three colli, three labels. */
  pages: LabelPage[]
  company?: CompanyInfo
}

/**
 * One label per package: "Colli 2/3", the address, what is in this box and a QR
 * holding that same contents as plain text.
 *
 * The QR deliberately does NOT hold the transport number on its own — that is
 * printed on the label in readable letters, so encoding it again would be a
 * second copy of something you can already read. It holds what you cannot see
 * without opening the box.
 */
export function ShippingLabelPDF({ transport, pages, company = DEFAULT_COMPANY }: Props) {
  return (
    <Document>
      {pages.map((page) => {
        const customer = page.order.customer as any
        const location = transport.location

        // Where the box is actually going: our own warehouse when the transport
        // is routed there, otherwise the customer's own delivery address.
        const toWarehouse = transport.ship_to === 'warehouse' && location
        const addr = toWarehouse
          ? location
          : (customer?.delivery_address?.street ? customer.delivery_address : customer?.billing_address) ?? {}

        const nameLine = toWarehouse ? location!.name : (customer?.company_name ?? '—')
        const streetLine = addr?.street ?? ''
        const cityLine = [formatPostcode((addr?.zip ?? '').trim()), addr?.city].filter(Boolean).join(' ')
        const destination = countryLabel(
          transport.destination || addr?.country || ''
        )

        return (
          <Page key={page.colliNumber} size="A4" style={styles.page}>
            {/* Logo + the QR holding this box's contents */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Image src="/spika-banner.png" style={{ flex: 1, height: 48, objectFit: 'contain' }} />
              {page.qrCodeDataUrl ? (
                <View style={{ alignItems: 'center', marginLeft: 12 }}>
                  <Image src={page.qrCodeDataUrl} style={{ width: 78, height: 78 }} />
                  <Text style={{ fontSize: 6, color: GRAY, marginTop: 2 }}>SCAN FOR CONTENTS</Text>
                </View>
              ) : null}
            </View>

            {/* From + transport number */}
            <View style={styles.fromRow}>
              <View style={styles.fromBlock}>
                <Text style={styles.fromLabel}>From</Text>
                <Text style={styles.fromName}>{company.name}</Text>
                <Text style={styles.fromLine}>{company.address_line1}</Text>
                <Text style={styles.fromLine}>{company.address_line2}</Text>
              </View>
              <View style={styles.refBox}>
                <Text style={styles.refText}>{transport.transport_number}</Text>
              </View>
            </View>

            <View style={styles.colliBox}>
              <Text style={styles.colliText}>
                COLLI {page.colliNumber} / {page.totalColli}
              </Text>
            </View>

            <Svg height={2} style={styles.divider}>
              <Line x1={0} y1={0} x2={531} y2={0} strokeWidth={2} stroke={RED} />
            </Svg>

            {/* Ship to */}
            <View style={{ marginTop: 4 }}>
              <Text style={styles.shipToLabel}>
                {toWarehouse ? 'Ship To — Warehouse' : 'Ship To'}
              </Text>
              <Text style={styles.shipToName}>{nameLine}</Text>
              {streetLine ? <Text style={styles.shipToLine}>{streetLine}</Text> : null}
              {cityLine ? <Text style={styles.shipToLine}>{cityLine}</Text> : null}
              {destination ? (
                <Text style={[styles.shipToLine, { color: RED, fontSize: 24, marginTop: 3 }]}>
                  {destination.toUpperCase()}
                </Text>
              ) : null}
            </View>

            {/* What is in THIS box */}
            <View style={{ marginTop: 10 }}>
              <Text style={styles.contentsLabel}>
                Contents · Order {page.order.order_number}
              </Text>
              {page.colli.items.length === 0 ? (
                <Text style={styles.contentsText}>Not packed out</Text>
              ) : page.colli.items.map((item) => (
                <View key={item.sku} style={styles.contentsRow}>
                  <Text style={styles.contentsText}>{item.name}</Text>
                  <Text style={styles.contentsText}>{item.qty}</Text>
                </View>
              ))}
              {page.colli.weight_kg !== null && page.colli.weight_kg !== undefined ? (
                <Text style={styles.contentsWeight}>
                  {Number(page.colli.weight_kg).toFixed(2)} kg
                </Text>
              ) : null}
            </View>

            <Image src="/fragile-icons.jpg" style={{ width: '100%', height: 150, objectFit: 'contain' }} />

            {transport.carrier ? (
              <Text style={{ fontSize: 9, color: GRAY, marginTop: 6 }}>
                Carrier: {transport.carrier.name}
                {transport.carrier.route ? `  ·  ${transport.carrier.route}` : ''}
              </Text>
            ) : null}
          </Page>
        )
      })}
    </Document>
  )
}
