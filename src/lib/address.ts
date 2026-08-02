/**
 * One way of writing an address, used by every document that prints one.
 *
 * It lived inside the invoice template until the same layout was needed on the
 * quotation and the shipping label, and the three of them promptly disagreed:
 * the invoice put the postcode on its own line, the quotation put it in front of
 * the town, and the export documents printed neither the street nor the
 * postcode. This is the single source now.
 *
 * European layout — postcode in front of the town, country spelled out:
 *
 *     Nieuwe Binnenweg 285A
 *     3021GG Rotterdam
 *     The Netherlands
 *
 * Curacao keeps the layout it always had (street, town, state, postcode,
 * country on separate lines).
 */

export interface AddressLike {
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
}

/**
 * Dutch postcode as one block: 3021GG, never 3021 GG. Spaces are stripped
 * whichever way it was typed in, so the document reads the same for every
 * customer regardless of who entered the record.
 */
export function formatPostcode(zip: string): string {
  const compact = zip.replace(/\s+/g, '')
  return /^\d{4}[A-Za-z]{2}$/.test(compact) ? compact.toUpperCase() : zip
}

/**
 * The country field is free text and has held several spellings of the same
 * place ('Curacao', 'CURAÇAO ', 'Nederland'). The stored values were cleaned up
 * on 2026-07-28, but this keeps the documents right regardless of what a future
 * import puts in there.
 */
export function countryLabel(country: string): string {
  const key = country.trim().toLowerCase().replace(/\s+/g, '')
  if (key === 'netherlands' || key === 'nederland' || key === 'thenetherlands') return 'The Netherlands'
  return country.trim()
}

/** True when an address should use the European layout. */
export function isEuropeanAddress(a: AddressLike | null | undefined): boolean {
  const key = (a?.country ?? '').trim().toLowerCase().replace(/\s+/g, '')
  return key === 'netherlands' || key === 'nederland' || key === 'thenetherlands'
}

/** The address as printable lines, blanks removed. */
export function addressLines(a: AddressLike | null | undefined, european: boolean): string[] {
  const clean = (v?: string | null) => (v ?? '').trim()
  const street = clean(a?.street)
  const city = clean(a?.city)
  const state = clean(a?.state)
  const zip = clean(a?.zip)
  const country = countryLabel(clean(a?.country))

  if (!european) return [street, city, state, zip, country].filter(Boolean)
  return [street, [formatPostcode(zip), city].filter(Boolean).join(' ').trim(), country].filter(Boolean)
}
