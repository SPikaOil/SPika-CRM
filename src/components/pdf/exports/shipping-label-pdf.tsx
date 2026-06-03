import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  Rect,
  Circle,
  Line,
  Image,
  G,
  Polyline,
  Polygon,
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

  // Icons row
  iconsRow: { flexDirection: 'row', gap: 14, marginTop: 20, marginBottom: 14, justifyContent: 'flex-start' },
  iconBox: { width: 80, height: 80, borderWidth: 3, borderColor: DARK, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },

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
}

// ── Shipping icons drawn with SVG ──────────────────────────────────────────

/** Umbrella / Keep Dry */
function IconUmbrella() {
  return (
    <Svg width={50} height={50} viewBox="0 0 100 100">
      {/* Umbrella dome */}
      <Path
        d="M10,55 Q10,10 50,10 Q90,10 90,55 Z"
        fill="none"
        stroke={DARK}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      {/* Center rib */}
      <Line x1={50} y1={10} x2={50} y2={75} stroke={DARK} strokeWidth={7} strokeLinecap="round" />
      {/* Handle curve */}
      <Path
        d="M50,75 Q50,92 38,92 Q26,92 26,80"
        fill="none"
        stroke={DARK}
        strokeWidth={7}
        strokeLinecap="round"
      />
      {/* Rain drops */}
      <Circle cx={25} cy={30} r={3} fill={DARK} />
      <Circle cx={40} cy={22} r={3} fill={DARK} />
      <Circle cx={60} cy={22} r={3} fill={DARK} />
      <Circle cx={75} cy={30} r={3} fill={DARK} />
    </Svg>
  )
}

/** This Side Up — two upward arrows */
function IconThisSideUp() {
  return (
    <Svg width={50} height={50} viewBox="0 0 100 100">
      {/* Left arrow */}
      <Polygon points="28,45 18,45 28,15 38,45 28,45" fill={DARK} />
      <Rect x={24} y={44} width={8} height={30} fill={DARK} />
      {/* Right arrow */}
      <Polygon points="62,45 52,45 62,15 72,45 62,45" fill={DARK} />
      <Rect x={58} y={44} width={8} height={30} fill={DARK} />
      {/* Base line */}
      <Line x1={12} y1={86} x2={88} y2={86} stroke={DARK} strokeWidth={7} strokeLinecap="round" />
    </Svg>
  )
}

/** Fragile / Breakable — wine glass */
function IconFragileGlass() {
  return (
    <Svg width={50} height={50} viewBox="0 0 100 100">
      {/* Glass bowl */}
      <Path
        d="M30,12 L70,12 L62,50 Q60,65 50,65 Q40,65 38,50 Z"
        fill="none"
        stroke={DARK}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      {/* Stem */}
      <Line x1={50} y1={65} x2={50} y2={84} stroke={DARK} strokeWidth={7} strokeLinecap="round" />
      {/* Base */}
      <Line x1={34} y1={84} x2={66} y2={84} stroke={DARK} strokeWidth={7} strokeLinecap="round" />
      {/* Crack */}
      <Path
        d="M50,18 L44,32 L52,38 L44,55"
        fill="none"
        stroke={DARK}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Handle with Care — two hands cupping a box */
function IconHandleWithCare() {
  return (
    <Svg width={50} height={50} viewBox="0 0 100 100">
      {/* Box/package in center */}
      <Rect x={36} y={28} width={28} height={28} rx={3} fill="none" stroke={DARK} strokeWidth={6} />
      {/* Left hand */}
      <Path
        d="M8,88 Q8,60 24,52 L36,48"
        fill="none"
        stroke={DARK}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M8,88 Q14,78 24,78 L36,70"
        fill="none"
        stroke={DARK}
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Right hand */}
      <Path
        d="M92,88 Q92,60 76,52 L64,48"
        fill="none"
        stroke={DARK}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M92,88 Q86,78 76,78 L64,70"
        fill="none"
        stroke={DARK}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function ShippingLabelPDF({ exportRecord, company = DEFAULT_COMPANY }: Props) {
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

        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image src="/spika-banner.png" style={{ width: '85%', height: 56, objectFit: 'contain' }} />
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
        <View style={styles.iconsRow}>
          <View style={styles.iconBox}><IconUmbrella /></View>
          <View style={styles.iconBox}><IconThisSideUp /></View>
          <View style={styles.iconBox}><IconFragileGlass /></View>
          <View style={styles.iconBox}><IconHandleWithCare /></View>
        </View>

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
