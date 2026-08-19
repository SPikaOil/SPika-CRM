import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Line,
  Svg,
} from '@react-pdf/renderer'

const BLACK = '#1a1a1a'
const RED = '#CC0000'

/**
 * What a field says when there is nothing to put in it: nothing.
 *
 * Her decision of 2026-08-19. It replaces an em dash, which never printed on
 * this form anyway: the standard Helvetica has no glyph for it, so the field
 * already read as blank — by accident rather than on purpose.
 */
const NONE = ''

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: BLACK,
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 52,
  },

  titleRow: { marginBottom: 20 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 3 },

  topRight: { alignSelf: 'flex-end', width: 280, marginBottom: 18 },
  companyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, gap: 8 },
  companyLabel: { fontSize: 9.5, color: BLACK },
  companyValue: {
    fontSize: 9.5,
    borderBottomWidth: 1,
    borderBottomColor: RED,
    minWidth: 120,
    paddingBottom: 1,
    flex: 1,
    textAlign: 'left',
  },

  city: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6, marginBottom: 20 },

  bodyText: { fontSize: 9.5, lineHeight: 1.65, marginBottom: 14 },
  bold: { fontFamily: 'Helvetica-Bold' },
  ul: { borderBottomWidth: 1, borderBottomColor: BLACK, paddingBottom: 1 },

  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  sigBlock: { width: '45%' },
  onBehalf: { fontSize: 9.5, marginBottom: 30 },
  sigImage: { width: 150, height: 60, objectFit: 'contain', marginBottom: 4 },
  nameLabel: { fontSize: 9.5, marginTop: 4 },
  titleLabel: { fontSize: 9.5, marginTop: 3 },
})

interface Props {
  company: string
  address: string
  coc: string
  crib: string
  signerName: string
  signerTitle: string
  signatureDataUrl: string
  signedAt?: string
}

export function OBFormPDF({ company, address, coc, crib, signerName, signerTitle, signatureDataUrl, signedAt }: Props) {
  const dateStr = signedAt
    ? new Date(signedAt).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>OB DECLARATIE FORMULIER 2026</Text>
          <Svg height={2} width={350}>
            <Line x1={0} y1={1} x2={350} y2={1} strokeWidth={1.5} stroke={BLACK} />
          </Svg>
        </View>

        {/* Top-right company info */}
        <View style={styles.topRight}>
          {[
            { label: 'Company :', value: company },
            { label: 'Address :', value: address },
            { label: 'Chamber of Commerce number:', value: coc },
            { label: 'Crib number:', value: crib },
          ].map(({ label, value }) => (
            <View key={label} style={styles.companyRow}>
              <Text style={styles.companyLabel}>{label}</Text>
              <Text style={styles.companyValue}>{value || ' '}</Text>
            </View>
          ))}
          <Text style={styles.city}>Willemstad , Curaçao</Text>
        </View>

        {/* Paragraph 1 */}
        <Text style={styles.bodyText}>
          {'Undersigned hereby declares that the goods produced by '}
          <Text style={styles.bold}>SPika Oil</Text>
          {' and delivered by '}
          <Text style={styles.bold}>Milsinc, SPika, Kaya Kiwa 3-a, Crib#102471812 & CoC# 145141</Text>
          {' to '}
          <Text style={styles.ul}>{company}</Text>
          {' are purchased by '}
          <Text style={styles.ul}>{company}</Text>
          {' as goods intended for resale to the end consumer.\n'}
          <Text style={styles.ul}>{company}</Text>
          {' purchases '}
          <Text style={styles.bold}>SPika Oil</Text>
          {' produced and delivered by '}
          <Text style={styles.bold}>Milsinc – SPika</Text>
          {' and subsequently sells this '}
          <Text style={styles.bold}>SPika Oil</Text>
          {' on the retail location of '}
          <Text style={styles.ul}>{company}</Text>
          {' to the end consumer.'}
        </Text>

        {/* Paragraph 2 */}
        <Text style={styles.bodyText}>
          {'Considering the foregoing, the sale of, the locally produced, '}
          <Text style={styles.bold}>SPika Oil</Text>
          {' by '}
          <Text style={styles.bold}>Milsinc -SPika</Text>
          {' to '}
          <Text style={styles.ul}>{company}</Text>
          {' is exempt from turnover tax based on article 7 paragraph 2 subparagraph A of the Curaçao Turnover Tax Ordinance 1999. This letter should be considered as the required declaration of '}
          <Text style={styles.bold}>Milsinc - SPika</Text>
          {' as meant in article 5 paragraph 1 under Ministerial Regulation on Turnover Tax.'}
        </Text>

        {/* Paragraph 3 */}
        <Text style={styles.bodyText}>
          {'This Declaration refers to all deliveries of SPika Oil, which are locally produced and delivered by '}
          <Text style={styles.bold}>Milsinc – SPika (SPika Oil)</Text>
          {' to '}
          <Text style={styles.ul}>{company}</Text>
          {' starting '}
          <Text style={styles.bold}>1st of January 2026</Text>
          {' until '}
          <Text style={styles.bold}>31 December 2026.</Text>
        </Text>

        <Text style={[styles.bodyText, { marginBottom: 0 }]}>Date: {dateStr}</Text>

        {/* Signatures */}
        <View style={styles.sigRow}>
          {/* SPika side */}
          <View style={styles.sigBlock}>
            <Text style={styles.onBehalf}>
              {'On behalf of '}
              <Text style={styles.bold}>Milsinc-SPika</Text>
            </Text>
            <Svg height={1} width={200}>
              <Line x1={0} y1={0} x2={200} y2={0} strokeWidth={1} stroke={BLACK} />
            </Svg>
            <Text style={styles.nameLabel}>Name : Danique L. Thijm</Text>
            <Text style={styles.titleLabel}>Title :  Owner</Text>
          </View>

          {/* Customer side */}
          <View style={styles.sigBlock}>
            <Text style={styles.onBehalf}>
              {'On behalf of '}
              <Text style={styles.ul}>{company}</Text>
            </Text>
            {signatureDataUrl ? (
              <Image src={signatureDataUrl} style={styles.sigImage} />
            ) : (
              <View style={{ height: 60 }} />
            )}
            <Svg height={1} width={200}>
              <Line x1={0} y1={0} x2={200} y2={0} strokeWidth={1} stroke={BLACK} />
            </Svg>
            <Text style={styles.nameLabel}>Name : {signerName}</Text>
            <Text style={styles.titleLabel}>Title :  {signerTitle || NONE}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
