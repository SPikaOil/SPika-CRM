import { createClient } from '@/lib/supabase/client'

/**
 * Generates the next order number by finding the last order's number
 * and incrementing the trailing numeric part by 1.
 * e.g. "O-2026-0020" → "O-2026-0021"
 *      "729083"       → "729084"
 *      "#729083"      → "#729084"
 */
export async function getNextOrderNumber(): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .not('order_number', 'is', null)
    .neq('order_number', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const last = data?.order_number ?? ''

  // Find the trailing numeric sequence and increment it
  const match = last.match(/^(.*?)(\d+)$/)
  if (match) {
    const prefix = match[1]
    const num = match[2]
    const next = String(parseInt(num, 10) + 1).padStart(num.length, '0')
    return `${prefix}${next}`
  }

  // Fallback: generate a fresh number
  return `O-${new Date().getFullYear()}-0001`
}
