import { createClient } from '@/lib/supabase/client'

/**
 * Generates the next invoice order number.
 * Looks at orders whose number does NOT start with "C-" (i.e. not cash).
 * e.g. "O-2026-0020" → "O-2026-0021"
 */
export async function getNextOrderNumber(): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .not('order_number', 'is', null)
    .neq('order_number', '')
    .not('order_number', 'like', 'C-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const last = data?.order_number ?? ''
  const match = last.match(/^(.*?)(\d+)$/)
  if (match) {
    const prefix = match[1]
    const num = match[2]
    const next = String(parseInt(num, 10) + 1).padStart(num.length, '0')
    return `${prefix}${next}`
  }

  return `O-${new Date().getFullYear()}-0001`
}

/**
 * Generates the next credit note number.
 *
 * A credit note is a document in its own right and carries its own number, in
 * its own sequence: CR-2026-0001, CR-2026-0002. It is deliberately NOT taken
 * from the invoice series — the customer has to be able to put the invoice and
 * the credit note side by side and see two different documents.
 */
export async function getNextCreditNoteNumber(): Promise<string> {
  const supabase = createClient()
  const year = new Date().getFullYear()

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', `CR-${year}-%`)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const last = data?.order_number ?? ''
  const match = last.match(/^CR-\d{4}-(\d+)$/)
  const next = match ? parseInt(match[1], 10) + 1 : 1
  return `CR-${year}-${String(next).padStart(4, '0')}`
}

/**
 * Generates the next cash order number.
 * Cash orders use a separate "C-YYYY-XXXX" sequence.
 * e.g. "C-2026-0004" → "C-2026-0005"
 */
export async function getNextCashOrderNumber(): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .not('order_number', 'is', null)
    .like('order_number', 'C-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const last = data?.order_number ?? ''
  const match = last.match(/^(.*?)(\d+)$/)
  if (match) {
    const prefix = match[1]
    const num = match[2]
    const next = String(parseInt(num, 10) + 1).padStart(num.length, '0')
    return `${prefix}${next}`
  }

  return `C-${new Date().getFullYear()}-0001`
}

/**
 * Generates the next free bottle service order number.
 * Free bottle orders use a separate "F-YYYY-XXXX" sequence.
 * e.g. "F-2026-0003" → "F-2026-0004"
 */
export async function getNextFreeBottleOrderNumber(): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .not('order_number', 'is', null)
    .like('order_number', 'F-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const last = data?.order_number ?? ''
  const match = last.match(/^(.*?)(\d+)$/)
  if (match) {
    const prefix = match[1]
    const num = match[2]
    const next = String(parseInt(num, 10) + 1).padStart(num.length, '0')
    return `${prefix}${next}`
  }

  return `F-${new Date().getFullYear()}-0001`
}

/**
 * Generates the next export number for a specific country and month.
 * Format: {ISO2}{YYYY}{MM}{NN}  e.g. NL20260501
 *
 * - ISO2 comes from the customer's billing country (same logic as getTaxIdInfo prefix)
 * - YYYY + MM are the current (or provided) year + month
 * - NN is a zero-padded 2-digit counter that resets every month per country
 *
 * Example sequence for Netherlands in May 2026:
 *   NL20260501 → NL20260502 → NL20260503 …
 */
export async function getNextExportNumber(
  countryIso: string,
  date: Date = new Date()
): Promise<string> {
  const supabase = createClient()

  const iso = countryIso.toUpperCase().slice(0, 2)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const prefix = `${iso}${year}${month}`

  // Find the highest export number for this country+month combination
  const { data } = await supabase
    .from('exports')
    .select('export_number')
    .like('export_number', `${prefix}%`)
    .order('export_number', { ascending: false })
    .limit(1)
    .single()

  if (data?.export_number) {
    // Extract the trailing counter and increment
    const counter = parseInt(data.export_number.slice(prefix.length), 10)
    const next = String((isNaN(counter) ? 0 : counter) + 1).padStart(2, '0')
    return `${prefix}${next}`
  }

  // First export this month for this country
  return `${prefix}01`
}

export async function getNextQuoteNumber(): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('quotes')
    .select('quote_number')
    .not('quote_number', 'is', null)
    .neq('quote_number', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const last = data?.quote_number ?? ''
  const match = last.match(/^(.*?)(\d+)$/)
  if (match) {
    const prefix = match[1]
    const num = match[2]
    const next = String(parseInt(num, 10) + 1).padStart(num.length, '0')
    return `${prefix}${next}`
  }

  return `Q-${new Date().getFullYear()}-0001`
}
