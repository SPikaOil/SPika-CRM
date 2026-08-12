import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a monetary amount with its currency prefix (e.g. "XCG 12.50", "USD 12.50") */
export function formatCurrency(amount: number, currency = 'XCG') {
  return `${currency} ${amount.toFixed(2)}`
}

/**
 * Two rules for showing an order's money, and they are not the same rule.
 *
 *   orderXcg / fmtXcg — what STAFF see. Guilders, converted with the rate frozen
 *                       on the order's invoice date (051), never today's rate.
 *                       A list of mixed currencies can then be read and added up.
 *   fmtOwnCurrency    — what a CUSTOMER sees. They owe what their invoice says,
 *                       in the currency their invoice says it in. Never converted.
 *
 * The bug these replace: `XCG {order.total}` printed a euro amount with a
 * guilder label in front of it and converted nothing — a figure that is wrong in
 * both currencies at once. It appeared on six separate screens before it was
 * caught, which is why this lives here and not in each of them.
 */
type MoneyOrder = { total?: unknown; fx_rate?: unknown; currency?: unknown } | null | undefined

export function orderXcg(order: MoneyOrder): number {
  return Number(order?.total ?? 0) * (Number(order?.fx_rate) || 1)
}

export function fmtXcg(amount: number): string {
  return `XCG ${amount.toFixed(2)}`
}

export function fmtOwnCurrency(order: MoneyOrder): string {
  return `${(order?.currency as string) ?? 'XCG'} ${Number(order?.total ?? 0).toFixed(2)}`
}

/**
 * What the QR code on a shipping label encodes: the transport number and how
 * many packages travel under it, e.g. "20260701-3colli". Colli is the sum of
 * the colli on every order in that transport. One helper, so the label, the
 * screen and whatever scans it can never disagree.
 */
export function transportQrPayload(transportNumber: string, colli: number): string {
  return `${transportNumber}-${colli}colli`
}

/**
 * THT (Tenminste Houdbaar Tot / best before) is a MONTH, never a day.
 *
 * The `exports.tht_date` column and the `tht_date` field on order/export items
 * stay a real date, so the day is pinned to the 1st — it is neither shown nor
 * entered anywhere. These three functions are the only way THT is read or
 * written; before this, eight screens and PDFs each formatted their own day.
 */
export function formatTht(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(`${value.slice(0, 7)}-01T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

/** Stored value ("2027-03-01") → what an `<Input type="month">` expects ("2027-03"). */
export function thtToMonthInput(value?: string | null): string {
  return value ? value.slice(0, 7) : ''
}

/** `<Input type="month">` value ("2027-03") → what we store ("2027-03-01"). */
export function monthInputToTht(value: string): string | null {
  return value ? `${value.slice(0, 7)}-01` : null
}

/**
 * The earliest month a THT may be set to: this one.
 *
 * A best-before in the past means the bottle is already expired, so it can only
 * be a typing mistake — and one that would travel all the way onto a packing
 * list and a customs document before anyone noticed. Fed to the `min` attribute
 * of every THT input.
 */
export function currentMonthInput(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** True when a stored THT lies before the current month. */
export function isThtInPast(value?: string | null): boolean {
  if (!value) return false
  return value.slice(0, 7) < currentMonthInput()
}
