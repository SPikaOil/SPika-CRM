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
