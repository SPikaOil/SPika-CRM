import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a monetary amount with its currency prefix (e.g. "XCG 12.50", "USD 12.50") */
export function formatCurrency(amount: number, currency = 'XCG') {
  return `${currency} ${amount.toFixed(2)}`
}
