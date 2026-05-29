/**
 * Maps a billing country to the correct tax identifier convention.
 *
 * Netherlands         → VAT  (field: vat_number,  ISO: NL)
 * Bonaire / BES       → CRIB (field: crib_number, ISO: BQ)
 * Curaçao             → CRIB (field: crib_number, ISO: CW)
 * Aruba               → CRIB (field: crib_number, ISO: AW)
 * Sint Maarten        → CRIB (field: crib_number, ISO: SX)
 * Other / unknown     → show both, default label VAT
 */

export type TaxField = 'vat_number' | 'crib_number'

export interface TaxIdInfo {
  label: string        // e.g. "VAT Number" or "CRIB Number"
  shortLabel: string   // e.g. "VAT" or "CRIB"
  field: TaxField
  prefix: string       // ISO country code prepended to the number, e.g. "NL" or "BQ"
  placeholder: string
}

const NL_COUNTRIES = ['netherlands', 'nederland', 'nl']

const CRIB_COUNTRIES = [
  'bonaire', 'bq', 'caribbean netherlands', 'bes',
  'curaçao', 'curacao', 'cw',
  'aruba', 'aw',
  'sint maarten', 'sx',
]

export function getTaxIdInfo(country: string): TaxIdInfo {
  const c = country.trim().toLowerCase()

  if (NL_COUNTRIES.some((k) => c === k || c.startsWith(k))) {
    return {
      label: 'VAT Number',
      shortLabel: 'VAT',
      field: 'vat_number',
      prefix: 'NL',
      placeholder: 'e.g. NL123456789B01',
    }
  }

  if (CRIB_COUNTRIES.some((k) => c === k || c.startsWith(k))) {
    const prefix =
      c.includes('cura') ? 'CW' :
      c.includes('aruba') || c === 'aw' ? 'AW' :
      c.includes('sint maarten') || c === 'sx' ? 'SX' :
      'BQ'
    return {
      label: 'CRIB Number',
      shortLabel: 'CRIB',
      field: 'crib_number',
      prefix,
      placeholder: 'e.g. 102471812',
    }
  }

  // Default: VAT (covers Belgium, Germany, etc.)
  return {
    label: 'VAT Number',
    shortLabel: 'VAT',
    field: 'vat_number',
    prefix: '',
    placeholder: 'e.g. BE0123456789',
  }
}

/** Returns a formatted display string like "NL VAT#123" or "BQ CRIB#456" */
export function formatTaxId(country: string, vatNumber?: string, cribNumber?: string): string | null {
  if (!country && !vatNumber && !cribNumber) return null
  const info = getTaxIdInfo(country ?? '')
  const value = info.field === 'crib_number' ? cribNumber : vatNumber
  if (!value) return null
  const prefix = info.prefix ? `${info.prefix} ` : ''
  return `${prefix}${info.shortLabel}#${value}`
}
