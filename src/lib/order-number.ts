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
    // Credit notes are numbered CR<invoice> and are NOT part of the invoice
    // series. Without this the next invoice after CR729134 would become
    // CR729135 — the credit note would hijack the numbering.
    .not('order_number', 'like', 'CR%')
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
 * The credit note number for a given invoice: CR + that invoice's number.
 *
 *   invoice 729134   -> CR729134
 *   invoice #729108  -> CR729108   (the stored '#' is not part of the number)
 *
 * Derived rather than sequential, on the owner's instruction: put the two
 * documents side by side and it is immediately clear which invoice is being
 * corrected, without looking anything up.
 *
 * A second, partial credit on the same invoice cannot reuse the number — a
 * document number has to be unique — so it gets -2, -3, and so on.
 */
export async function getCreditNoteNumber(invoiceNumber: string): Promise<string> {
  const supabase = createClient()
  const base = `CR${(invoiceNumber ?? '').replace(/^#+/, '').trim()}`

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', `${base}%`)

  const taken = new Set((data ?? []).map(r => r.order_number))
  if (!taken.has(base)) return base

  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
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

// getNextExportNumber lived here until 2026-08-15. It handed out NL20260501
// style numbers from the `exports` table, which migration 054 replaced with
// transports — those get their number from next_transport_number() in the
// database instead, so two people creating one in the same minute cannot land
// on the same value. Nothing called this any more.

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
