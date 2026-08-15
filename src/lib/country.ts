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

/**
 * Whether an order for this customer is an EXPORT. Anything that is not Curaçao
 * leaves the island, so it needs a transport, customs papers and a B/L.
 *
 * Danique, 2026-08-15: the app used to read a hand-set "international" switch on
 * the customer card. Two things then said the same thing — the country in the
 * address and that switch — and nothing kept them in step. Forget to flick it
 * for a new customer in Germany and their order is silently not an export: not
 * in the Export tab, not in the dashboard warning, not covered by the rule that
 * an export needs a transport number. The address is the truth, so the address
 * decides.
 *
 * An address with no country at all counts as Curaçao. Almost every customer is
 * local and the field is often left blank; treating blank as export would fill
 * the Export tab with the whole customer base.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isExportCustomer(customer: any): boolean {
  const code = customerCountryCode(customer)
  return code !== null && code !== 'CUR'
}
