/**
 * Which tax a document names, decided by the CURRENCY it is written in.
 *
 * Danique, 2026-11-06: "de stelregel is: valuta is leidend. Als USD -> VAT, als
 * EUR -> BTW, als XCG -> OB... als andere valuta erbij komt dienen we dit in te
 * stellen."
 *
 * Before this, every tax line in the app named OB (on the two PDFs) or VAT (on
 * the six screens) regardless of currency — so a euro invoice to Rotterdam
 * announced Curacao turnover tax. The rename of 2026-05-29 only ever reached
 * the two PDFs; the screens were never swept, which is why document and screen
 * disagreed for five months.
 *
 * ONE place, read by every screen and every document. A tenth place that
 * invents its own label is the bug this file exists to make impossible.
 *
 * The RATE is not decided here. Every caller keeps its own rate rule (6% for
 * b2c, 0% otherwise) because a rate is a fiscal decision, not a label. There
 * are no b2c customers outside XCG today, so no document is affected by that
 * distinction yet; when the first one appears the rate needs its own answer.
 */

export type TaxName = 'OB' | 'BTW' | 'VAT'

/**
 * Currency to tax name. Until the Settings screen lands this is the single
 * source of truth; after that it seeds the stored value.
 */
export const TAX_NAME_BY_CURRENCY: Record<string, TaxName> = {
  XCG: 'OB',
  EUR: 'BTW',
  USD: 'VAT',
}

/** What an unknown currency falls back to, until someone sets it in Settings. */
export const FALLBACK_TAX_NAME: TaxName = 'OB'

/** The tax a document in this currency names. */
export function taxNameFor(currency?: string | null): TaxName {
  const key = (currency ?? 'XCG').trim().toUpperCase()
  return TAX_NAME_BY_CURRENCY[key] ?? FALLBACK_TAX_NAME
}

/**
 * The label beside the tax amount, e.g. "BTW (0% — BTW exempt)".
 *
 * The wording stays as it is. It wrapped onto a second line on the invoice
 * because the label column was 100pt wide, not because the sentence was wrong
 * — Danique, 2026-11-06: "ik wil geen tekst stacked hebben op factuur". That is
 * fixed where it belongs, in the column width on the document.
 */
export function taxLineLabel(currency: string | null | undefined, isB2C: boolean): string {
  const tax = taxNameFor(currency)
  return isB2C ? `${tax} (6%)` : `${tax} (0% — ${tax} exempt)`
}

/** The sentence under the total, e.g. "Out of Scope of BTW". */
export function outOfScopeLabel(currency?: string | null): string {
  return `Out of Scope of ${taxNameFor(currency)}`
}

/** The one-line statement on a consignment note: goods leaving Curacao. */
export function exportTaxNote(currency?: string | null): string {
  return `${taxNameFor(currency)} 0% — export from Curacao`
}
