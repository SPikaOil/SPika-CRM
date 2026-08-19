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
import { LabelPage, colliGrossWeight, type ProductWeights } from '@/lib/transport-cargo'

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

  // FROM and the colli counter on the left, QR and transport number on the
  // right, both starting at the very top of the page. This replaced a logo
  // strip that sat above them and a second row below it.
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
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
    marginTop: 10,
  },
  colliText: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1 },

  divider: { marginVertical: 4 },

  shipToLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
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
  /** What one bottle weighs per sku, in grams, from Products. */
  productWeights?: ProductWeights
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
export function ShippingLabelPDF({
  transport, pages, company = DEFAULT_COMPANY, productWeights = {},
}: Props) {
  return (
    <Document>
      {pages.map((page) => {
        const customer = page.order.customer as any
        const location = transport.location
        // The door this load is actually delivered to, when one is picked (095).
        // It wins over the warehouse's own address: the box has to arrive where
        // the carrier drops it, not where it is eventually stored. Its `label`
        // is in-app only and never goes on a box.
        const drop = transport.delivery_address

        // Where the box is actually going: the drop-off, else our warehouse when
        // the transport is routed there, else the customer's own address.
        const toWarehouse = transport.ship_to === 'warehouse' && (drop || location)
        const addr = drop
          ? drop
          : toWarehouse
            ? location
            : (customer?.delivery_address?.street ? customer.delivery_address : customer?.billing_address) ?? {}

        // A drop-off carries two names and only one may be printed (096): its
        // `name` is who the goods are addressed to there, its `label` is our own
        // display name and stays in the app. The warehouse's name stays off the
        // box too — it would send the driver to the wrong building.
        const attn = (transport.receiver_contact ?? '').trim()
          || (drop?.receiver_contact ?? '').trim()
        const nameLine = drop
          ? (drop.name || (attn ? `Attn. ${attn}` : (drop.street || '-')))
          : toWarehouse ? location!.name : (customer?.company_name ?? '-')
        const streetLine = nameLine === (addr?.street ?? '') ? '' : (addr?.street ?? '')
        const cityLine = [formatPostcode((addr?.zip ?? '').trim()), addr?.city].filter(Boolean).join(' ')
        const destination = countryLabel(
          transport.destination || addr?.country || ''
        )

        return (
          <Page key={page.colliNumber} size="A4" style={styles.page}>
            {/* NO LOGO on a shipping label, and it stays that way — her
                instruction of 2026-08-19. A label is read by a driver and a
                receiving clerk; the banner took 48pt off the top and told them
                nothing they needed.

                What it left behind is filled rather than left empty: FROM and
                the colli counter now sit beside the QR instead of below it, so
                the whole label closes higher up the page. Nothing here changed
                size — only where it sits. */}
            <View style={styles.headRow}>
              <View style={styles.fromBlock}>
                <Text style={styles.fromLabel}>From</Text>
                <Text style={styles.fromName}>{company.name}</Text>
                <Text style={styles.fromLine}>{company.address_line1}</Text>
                <Text style={styles.fromLine}>{company.address_line2}</Text>

                <View style={styles.colliBox}>
                  <Text style={styles.colliText}>
                    COLLI {page.colliNumber} / {page.totalColli}
                  </Text>
                </View>
              </View>

              {/* The QR and the transport number, stacked in the corner the
                  banner used to occupy. */}
              <View style={{ alignItems: 'center' }}>
                {page.qrCodeDataUrl ? (
                  <>
                    <Image src={page.qrCodeDataUrl} style={{ width: 78, height: 78 }} />
                    <Text style={{ fontSize: 6, color: GRAY, marginTop: 2 }}>SCAN FOR CONTENTS</Text>
                  </>
                ) : null}
                <View style={[styles.refBox, { marginTop: 6 }]}>
                  <Text style={styles.refText}>{transport.transport_number}</Text>
                </View>
              </View>
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
              {/* Who is expected there. Only once — when there is no name of its
                  own, the Attn. has already been promoted to the line above. */}
              {attn && nameLine !== `Attn. ${attn}` ? (
                <Text style={styles.shipToLine}>Attn. {attn}</Text>
              ) : null}
              {streetLine ? <Text style={styles.shipToLine}>{streetLine}</Text> : null}
              {cityLine ? <Text style={styles.shipToLine}>{cityLine}</Text> : null}
              {destination ? (
                <Text style={[styles.shipToLine, { color: RED, fontSize: 24, marginTop: 3 }]}>
                  {destination.toUpperCase()}
                </Text>
              ) : null}
            </View>

            {/* Contents on the left, handling icons on the right.
                They used to be stacked, and the icon strip alone was 150pt tall
                — with everything else that put the label at 550pt on an 842pt
                page. Side by side they cost the height of the taller of the
                two instead of the sum, which is what brings the whole label
                inside the top half. No text changed size. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
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
                {/* The GROSS weight of this one box: the packaging typed on it
                    plus the bottles inside, at the weight the Products screen
                    holds. It used to print the packaging alone, so a box of 42
                    bottles said 1.00 kg. Her instruction of 2026-08-19. */}
                {colliGrossWeight(page.colli, productWeights).kg > 0 ? (
                  <Text style={styles.contentsWeight}>
                    {colliGrossWeight(page.colli, productWeights).kg.toFixed(2)} kg
                  </Text>
                ) : null}
              </View>

              {/* 984x512 in the file, so 134pt wide draws 70pt tall. Sized to land the
                  whole label inside the top half of the page — measured, see below. */}
              <Image src="/fragile-icons.jpg" style={{ width: 134, height: 70, objectFit: 'contain' }} />
            </View>

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
