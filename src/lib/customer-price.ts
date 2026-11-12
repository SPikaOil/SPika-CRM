import { SPIKA_PRODUCTS } from '@/lib/products'
import type { QuoteItem } from '@/types'

/**
 * What one product costs one customer.
 *
 * Two fields on the customer decide it: `product_prices` holds the GROSS price
 * agreed with them, `product_discounts` the amount taken off it. A line is
 * worth qty x (price - discount), and the discount is carried on the line so
 * the invoice can print it in its own column.
 *
 * ONE place, because retyping that sum is what went wrong. On 2026-11-06 a
 * consignment settlement for La Bandera went out at EUR 299.50 instead of
 * EUR 239.60: the discount was copied onto every line, printed in the DISCOUNT
 * column, and never subtracted — one route out of eleven that each wrote the
 * sum out by hand. The customer found it after a payment reminder.
 *
 * The three portal screens were worse than wrong: they never read
 * `product_discounts` at all, so a reseller ordering for themselves would have
 * been charged the gross price on every line. No portal order with a discount
 * exists, because no customer has portal access yet — but all 28 customers
 * have a discount on at least one product, so it would have hit every one of
 * them the day the first login was handed out.
 */

type PriceBook = {
  product_prices?: Record<string, number> | null
  product_discounts?: Record<string, number> | null
} | null | undefined

/** The list price agreed with this customer, before any discount. */
export function grossPriceFor(customer: PriceBook, sku: string): number {
  const own = customer?.product_prices?.[sku]
  if (own !== undefined && own !== null && Number.isFinite(Number(own))) return Number(own)
  return SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
}

/** The amount taken off that price for this customer. Never negative. */
export function discountFor(customer: PriceBook, sku: string): number {
  const d = Number(customer?.product_discounts?.[sku] ?? 0)
  return Number.isFinite(d) && d > 0 ? d : 0
}

/** What the customer actually pays per unit. */
export function netPriceFor(customer: PriceBook, sku: string): number {
  return Math.max(0, grossPriceFor(customer, sku) - discountFor(customer, sku))
}

/** What a line of `qty` is worth: qty x (price - discount), rounded to cents. */
export function lineTotalFor(customer: PriceBook, sku: string, qty: number): number {
  return parseFloat((netPriceFor(customer, sku) * (Number(qty) || 0)).toFixed(2))
}

/**
 * A complete order line for this customer, in the shape orders.items uses.
 * Gross price and discount both stay on the line: the invoice prints them in
 * their own columns, and the amount has to agree with them.
 */
export function orderLineFor(
  customer: PriceBook,
  product: { sku: string; name: string },
  qty: number,
): QuoteItem {
  return {
    sku: product.sku,
    name: product.name,
    qty,
    unit_price: grossPriceFor(customer, product.sku),
    discount: discountFor(customer, product.sku),
    line_total: lineTotalFor(customer, product.sku, qty),
  }
}
