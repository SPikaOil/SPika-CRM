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
import { Export } from '@/types'
import { CompanyInfo } from '../delivery-note-pdf'

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

  // Header logo
  logoWrap: { alignItems: 'center', marginBottom: 10 },

  // From row
  fromRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  fromBlock: { flex: 1 },
  fromLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  fromLine: { fontSize: 8.5, color: DARK, marginBottom: 1 },
  fromName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 1 },

  refBox: { backgroundColor: DARK, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 3 },
  refText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },

  // Divider
  divider: { marginVertical: 10 },

  // Large ship-to
  shipToLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  shipToName: { fontSize: 48, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4, lineHeight: 1.1 },
  shipToLine: { fontSize: 40, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2, lineHeight: 1.15 },

  // FRAGILE
  fragileText: { fontSize: 84, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: 4, marginTop: 4 },
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
  qrCodeDataUrl?: string
}


export function ShippingLabelPDF({ exportRecord, company = DEFAULT_COMPANY, qrCodeDataUrl }: Props) {
  const order = exportRecord.order as any
  const customer = (order?.customer ?? (exportRecord as any).customer) as any

  const billingAddr = customer?.billing_address ?? {}
  const deliveryAddr = customer?.delivery_address ?? {}
  const shipToAddr = deliveryAddr?.street ? deliveryAddr : billingAddr
  const destination = exportRecord.destination || billingAddr?.country || ''

  const carrier = (exportRecord as any).carrier

  // Build address lines
  const nameLine = customer?.company_name ?? '—'
  const streetLine = shipToAddr?.street ?? ''
  const cityLine = [shipToAddr?.zip, shipToAddr?.city].filter(Boolean).join(' ')

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Logo + QR code side by side */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Image src="/spika-banner.png" style={{ flex: 1, height: 56, objectFit: 'contain' }} />
          {qrCodeDataUrl ? (
            <View style={{ alignItems: 'center', marginLeft: 12 }}>
              <Image src={qrCodeDataUrl} style={{ width: 70, height: 70 }} />
              <Text style={{ fontSize: 6, color: GRAY, marginTop: 2 }}>SCAN FOR DETAILS</Text>
            </View>
          ) : null}
        </View>

        {/* From + ref */}
        <View style={styles.fromRow}>
          <View style={styles.fromBlock}>
            <Text style={styles.fromLabel}>From</Text>
            <Text style={styles.fromName}>{company.name}</Text>
            <Text style={styles.fromLine}>{company.address_line1}</Text>
            <Text style={styles.fromLine}>{company.address_line2}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refText}>{exportRecord.export_number}</Text>
          </View>
        </View>

        {/* Red divider */}
        <Svg height={2} style={styles.divider}>
          <Line x1={0} y1={0} x2={531} y2={0} strokeWidth={2} stroke={RED} />
        </Svg>

        {/* Large ship-to address */}
        <View style={{ marginTop: 8 }}>
          <Text style={styles.shipToLabel}>Ship To</Text>
          <Text style={styles.shipToName}>{nameLine}</Text>
          {streetLine ? <Text style={styles.shipToLine}>{streetLine}</Text> : null}
          {cityLine ? <Text style={styles.shipToLine}>{cityLine}</Text> : null}
          {destination ? (
            <Text style={[styles.shipToLine, { color: RED, fontSize: 36, marginTop: 4 }]}>
              {destination.toUpperCase()}
            </Text>
          ) : null}
        </View>

        {/* Handling icons */}
        <Image src="/fragile-icons.jpg" style={{ width: '100%', height: 100, objectFit: 'contain' }} />

        {/* FRAGILE */}
        <Text style={styles.fragileText}>FRAGILE</Text>

        {/* Carrier note at bottom if present */}
        {carrier ? (
          <Text style={{ fontSize: 9, color: GRAY, marginTop: 10 }}>
            Carrier: {carrier.name}{carrier.route ? `  ·  ${carrier.route}` : ''}
          </Text>
        ) : null}

      </Page>
    </Document>
  )
}
