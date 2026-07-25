// Shared CSV export. One helper so every page produces the same well-formed
// file: values are escaped (company names contain commas), and a UTF-8 BOM is
// prepended so Excel renders Curaçao names with accents correctly instead of
// mojibake.

export type CsvValue = string | number | null | undefined

function escapeCell(v: CsvValue): string {
  if (v == null) return ''
  const s = String(v)
  // Quote when the value contains a delimiter, quote or newline; double inner quotes
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map(r => r.map(escapeCell).join(',')).join('\r\n')
}

// Build and download a CSV. Filename gets the date appended automatically:
// downloadCsv('orders', [...], [...]) → spika-orders-2026-07-25.csv
export function downloadCsv(name: string, headers: string[], rows: CsvValue[][]) {
  const csv = toCsv(headers, rows)
  // ﻿ = BOM, tells Excel the file is UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spika-${name}-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Common formatters, so dates and money look the same in every export
export const csvDate = (d: string | null | undefined) =>
  d ? new Date(d).toISOString().split('T')[0] : ''

export const csvMoney = (n: number | string | null | undefined) =>
  n == null || n === '' ? '' : Number(n).toFixed(2)
