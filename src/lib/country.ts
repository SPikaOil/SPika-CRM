// Country in customer billing addresses is free text ("Curacao", "CURAÇAO ",
// "Nederland", …) — normalize it to a compact country code for lists/filters.
export function countryCode(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null
  const c = raw.trim().toLowerCase()
  if (c.startsWith('cura')) return 'CW'
  if (c === 'netherlands' || c === 'the netherlands' || c === 'nederland' || c === 'holland') return 'NL'
  if (c.startsWith('bonaire')) return 'BON'
  if (c.startsWith('aruba')) return 'AW'
  if (c.startsWith('united states') || c === 'usa' || c === 'us') return 'US'
  if (c.startsWith('germany') || c.startsWith('duits')) return 'DE'
  if (c.startsWith('belgi')) return 'BE'
  if (c.startsWith('sint maarten') || c === 'sxm') return 'SX'
  return raw.trim().slice(0, 2).toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function customerCountryCode(customer: any): string | null {
  return countryCode(customer?.billing_address?.country)
}
