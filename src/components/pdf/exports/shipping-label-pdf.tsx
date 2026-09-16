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
import { fitOneLine } from '@/lib/pdf-text'

/**
 * How much room the address block actually has, in points.
 *
 * A4 is 595.28 wide and the page keeps 32 off each side, so 531.28 is printed
 * on. The handling icons take their full 288 and the gap between them takes 12,
 * which leaves this. It is written down rather than measured at print time
 * because react-pdf has no layout to ask — the size of the type has to be
 * decided before the page is built.
 */
const ADDRESS_WIDTH = 595.28 - 32 * 2 - 288 - 12

const RED = '#CC0000'
const DARK = '#1a1a1a'
const GRAY = '#555555'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
  },

  // FROM and the colli counter on the left, QR and transport number on the
  // right, both starting at the very top of the page. This replaced a logo
  // strip that sat above them and a second row below it.
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 0 },
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

  divider: { marginVertical: 3 },

  shipToLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 },
  // 34/26/24 before. The address is the only thing on this label that could
  // give height back: the handling icons keep their full 150pt and the QR its
  // 78, both by her instruction. Still the biggest type on the page by far —
  // it has to be readable off a pallet.
  shipToName: { fontSize: 30, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2, lineHeight: 1.1 },
  // Not bold — her instruction of 2026-09-15: only the customer's name and the
  // country are set heavy, so those two are what the eye lands on first. The
  // Attn., the street and the town are read once you are already at the box.
  shipToLine: { fontSize: 22, fontFamily: 'Helvetica', color: DARK, marginBottom: 1, lineHeight: 1.15 },

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
  // Whose address a customer-routed transport goes to. Read off the TRANSPORT,
  // not off the box: a transport goes to one address, so every label on it
  // carries the same one. Since migration 100 a box need not belong to an order
  // at all — it can be loose stock — and taking the address from the box would
  // have printed nothing at all for those.
  const customer = (transport.orders ?? [])[0]?.customer as any

  return (
    <Document>
      {pages.map((page) => {
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

        /**
         * The company name goes on ONE line. Her instruction of 2026-09-15:
         * "zet de hele naam op 1 regel". Not two, not three — one, whatever the
         * name is, so the size is what gives and never the name.
         *
         * 30 stays the size it is printed at whenever it fits, which is most
         * labels. On transport 20260901 it did not fit and react-pdf hyphenated
         * it into "Canarbo Epicu-" and "rian Market"; that name now comes out
         * whole at 18.5.
         *
         * The lines under it are NOT touched. She asked about the name, so the
         * name is what changed.
         */
        const attnLine = attn && nameLine !== `Attn. ${attn}` ? `Attn. ${attn}` : ''
        const nameSize = fitOneLine(nameLine, ADDRESS_WIDTH, 30, 'Helvetica-Bold')

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

              {/* Transport number BESIDE the QR rather than under it. Stacked
                  it cost 28pt of height, and every point here is a point the
                  address gets to keep. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={[styles.refBox, { marginTop: 2 }]}>
                  <Text style={styles.refText}>{transport.transport_number}</Text>
                </View>
                {page.qrCodeDataUrl ? (
                  <View style={{ alignItems: 'center' }}>
                    <Image src={page.qrCodeDataUrl} style={{ width: 78, height: 78 }} />
                    <Text style={{ fontSize: 6, color: GRAY, marginTop: 2 }}>SCAN FOR CONTENTS</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Svg height={2} style={styles.divider}>
              <Line x1={0} y1={0} x2={531} y2={0} strokeWidth={2} stroke={RED} />
            </Svg>

            {/* Address on the left, handling icons on the right — her layout of
                2026-08-19.

                The icons keep the size they have always had: 150pt tall, which
                at their 984x512 draws them 288pt wide. That leaves 231pt for the
                address, and the type is set as large as fits in that — measured
                against the real lines in Helvetica-Bold rather than guessed:
                the longest, "Van Maasdijkweg 72", is 192pt at 20. Side by side
                they also cost one block of height instead of two, which is what
                lets the address grow back at all. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4 }}>
              {/* The text lines up with the icons, top and bottom — her
                  instruction of 2026-09-15: "ship to" level with where the
                  icons begin, "BONAIRE" level with the underside of FRAGILE.
                  Only the text moves; the picture is not touched.

                  The two numbers are measured, not picked. The image is 984x512
                  and is drawn 288 wide, so 149.85 of the 150pt box is picture —
                  but the artwork inside it starts at pixel row 22 and the
                  bottom of FRAGILE is pixel row 492, which is 6.44pt of white
                  above and 5.56pt below.

                  The bottom needs no help: pinned to the foot of a 150pt block,
                  the last line's baseline lands at 144.50 and the underside of
                  FRAGILE is at 144.44. The top does — a 9pt capital sits 1.64pt
                  down from its own line box, so the block starts 4.8pt lower to
                  put it at 6.44. Both checked by reading the positions back out
                  of a rendered PDF. */}
              <View style={{ flex: 1, height: 150, paddingTop: 4.8, justifyContent: 'space-between' }}>
                <Text style={styles.shipToLabel}>
                  {toWarehouse ? 'Ship To — Warehouse' : 'Ship To'}
                </Text>
                <Text style={[styles.shipToName, { fontSize: nameSize }]}>{nameLine}</Text>
                {/* Who is expected there. Only once — when there is no name of
                    its own, the Attn. has already been promoted to the line
                    above. */}
                {attnLine ? (
                  <Text style={styles.shipToLine}>{attnLine}</Text>
                ) : null}
                {streetLine ? <Text style={styles.shipToLine}>{streetLine}</Text> : null}
                {cityLine ? <Text style={styles.shipToLine}>{cityLine}</Text> : null}
                {destination ? (
                  <Text style={[styles.shipToLine, { fontFamily: 'Helvetica-Bold', color: RED, marginTop: 3 }]}>
                    {destination.toUpperCase()}
                  </Text>
                ) : null}
              </View>

              <Image src="/fragile-icons.jpg" style={{ width: 288, height: 150, objectFit: 'contain' }} />
            </View>

            {/* The contents used to be printed here as well — order number,
                every product with its quantity, and the weight. Off the sheet
                since 2026-08-19: it is already in the QR, and a label is read
                from a distance while a scan answers "what is in this one?".
                Printing it twice only made the label taller. */}

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
