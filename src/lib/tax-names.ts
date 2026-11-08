/**
 * What a document says about tax: the NAME comes from the currency, the RATE
 * comes from the customer's category.
 *
 * Danique, 2026-11-06: "de stelregel is: valuta is leidend. Als USD -> VAT, als
 * EUR -> BTW, als XCG -> OB." And, correcting a first attempt that hung the
 * rate on the currency too: "XCG is 0, 6 en soms 9... de klantcategorie bepaalt
 * het tarief."
 *
 * So the two questions have two different answers and two different homes, and
 * neither is hard-coded any more:
 *
 *   currency  -> name        (Settings -> Tax, top half)
 *   category  -> percentage  (Settings -> Tax, bottom half)
 *
 * Before this, every tax line named OB (on the three documents) or VAT (on the
 * six screens) whatever the currency, and the rate was the literal 0.06 in six
 * separate files. The rename of 2026-05-29 only ever reached the two PDFs,
 * which is why document and screen disagreed for five months. ONE place now
 * answers both questions for all ten callers.
 */

export interface CurrencyTax {
  /** What the tax is called on paper: OB, BTW, VAT, or whatever she types. */
  name: string
}

/** Shipped defaults. Seeds Settings the first time, and the fallback after. */
export const DEFAULT_CURRENCY_TAX: Record<string, CurrencyTax> = {
  XCG: { name: 'OB' },
  EUR: { name: 'BTW' },
  USD: { name: 'VAT' },
}

/** Where an unknown currency lands until someone sets it in Settings. */
export const FALLBACK_TAX_NAME = 'OB'

/**
 * Percentage per customer category.
 *
 * The defaults are exactly what the app charged before it became settable:
 * 6% for B2C, nothing for everyone else. No category is assumed to be 9% —
 * that is hers to set, per category, in Settings.
 */
export const DEFAULT_CATEGORY_TAX: Record<string, number> = {
  b2c: 6,
}

/** A category nobody has set yet charges nothing. */
export const FALLBACK_CATEGORY_RATE = 0

/** The keys these live under in app_settings. */
export const CURRENCY_TAX_KEY = 'currency_tax'
export const CATEGORY_TAX_KEY = 'category_tax'

/**
 * The live configuration.
 *
 * Plain module values rather than a React context: the PDFs are rendered
 * outside the component tree, so a hook could not reach them. Filled once by
 * <CurrencyTaxLoader /> when the app boots; until then, and whenever nothing
 * has been saved, the defaults above answer.
 */
let currencyConfig: Record<string, CurrencyTax> = { ...DEFAULT_CURRENCY_TAX }
let categoryConfig: Record<string, number> = { ...DEFAULT_CATEGORY_TAX }

export function setCurrencyTaxConfig(next: Record<string, CurrencyTax> | null | undefined) {
  if (!next || typeof next !== 'object') return
  currencyConfig = { ...DEFAULT_CURRENCY_TAX, ...next }
}

export function setCategoryTaxConfig(next: Record<string, number> | null | undefined) {
  if (!next || typeof next !== 'object') return
  categoryConfig = { ...next }
}

/** The whole configuration, for the Settings screen. */
export function currencyTaxConfig(): Record<string, CurrencyTax> {
  return { ...currencyConfig }
}
export function categoryTaxConfig(): Record<string, number> {
  return { ...categoryConfig }
}

/** The tax a document in this currency names. */
export function taxNameFor(currency?: string | null): string {
  const key = (currency ?? 'XCG').trim().toUpperCase()
  return currencyConfig[key]?.name ?? FALLBACK_TAX_NAME
}

/** The percentage this customer category carries, e.g. 6 — not 0.06. */
export function taxPercentageFor(category?: string | null): number {
  const key = (category ?? '').trim().toLowerCase()
  const pct = categoryConfig[key]
  return Number.isFinite(pct) ? Number(pct) : FALLBACK_CATEGORY_RATE
}

/** The same rate as a fraction, for multiplying a subtotal by. */
export function taxRateFor(category?: string | null): number {
  return taxPercentageFor(category) / 100
}

/**
 * The label beside the tax amount, e.g. "BTW (0% — BTW exempt)".
 *
 * It wrapped onto a second line on the invoice because the label column was
 * 100pt wide, not because the sentence was wrong — Danique, 2026-11-06: "ik wil
 * geen tekst stacked hebben op factuur". That is fixed where it belongs, in the
 * column width on the document.
 */
export function taxLineLabel(currency: string | null | undefined, category?: string | null): string {
  const name = taxNameFor(currency)
  const pct = taxPercentageFor(category)
  return pct > 0 ? `${name} (${pct}%)` : `${name} (0% — ${name} exempt)`
}

/** The sentence under the total, e.g. "Out of Scope of BTW". */
export function outOfScopeLabel(currency?: string | null): string {
  return `Out of Scope of ${taxNameFor(currency)}`
}

/** The one-line statement on a consignment note: goods leaving Curacao. */
export function exportTaxNote(currency?: string | null): string {
  return `${taxNameFor(currency)} 0% — export from Curacao`
}
