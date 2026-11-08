'use client'

import { useCurrencyTax } from '@/hooks/use-currency-tax'

/**
 * Loads the tax-per-currency setting into lib/tax-names once, when the app
 * boots.
 *
 * It has to live here rather than in the components that need it: the PDFs are
 * rendered outside the React tree, so they cannot read a hook or a context.
 * The hook writes the answer into a module value they can see. Until it
 * arrives — and whenever the setting has never been saved — the shipped
 * defaults answer, which are the values every document already printed.
 *
 * Renders nothing.
 */
export function CurrencyTaxLoader() {
  useCurrencyTax()
  return null
}
