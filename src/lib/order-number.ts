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
