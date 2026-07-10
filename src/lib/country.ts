// Country in customer billing addresses is free text ("Curacao", "CURAÇAO ",
// "Nederland", …) — normalize it to a compact country code for lists/filters.
export function countryCode(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null
  const c = raw.trim().toLowerCase()
  if (c.startsWith('cura') || c === 'cw' || c === 'cur') return 'CUR'
  if (c === 'netherlands' || c === 'the netherlands' || c === 'nederland' || c === 'holland') return 'NL'
  if (c.startsWith('bonaire') || c === 'bon' || c === 'bq') return 'BON'
  if (c.startsWith('aruba') || c === 'aw' || c === 'aua') return 'AUA'
  if (c.startsWith('united states') || c === 'usa' || c === 'us') return 'US'
  if (c.startsWith('germany') || c.startsWith('duits')) return 'DE'
  if (c.startsWith('belgi')) return 'BE'
  if (c.startsWith('sint maarten') || c === 'sx' || c === 'sxm') return 'SXM'
  return raw.trim().slice(0, 2).toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function customerCountryCode(customer: any): string | null {
  return countryCode(customer?.billing_address?.country)
}
