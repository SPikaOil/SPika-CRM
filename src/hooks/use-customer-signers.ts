import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CustomerSigner = { name: string; count: number; last: string | null }

// Known people who have signed for deliveries at a given customer, derived
// live from delivery history (no separate table needed — every completed
// delivery already stores signer_name). Most frequent first.
export function useCustomerSigners(customerId?: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer-signers', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<CustomerSigner[]> => {
      const { data: orders } = await supabase.from('orders').select('id').eq('customer_id', customerId!)
      const ids = (orders ?? []).map((o: any) => o.id)
      if (!ids.length) return []
      const { data: dels } = await supabase
        .from('deliveries')
        .select('signer_name, delivered_at')
        .in('order_id', ids)
        .not('signer_name', 'is', null)
        .order('delivered_at', { ascending: false })
      const map = new Map<string, CustomerSigner>()
      for (const d of (dels ?? []) as any[]) {
        const name = (d.signer_name ?? '').trim()
        if (!name) continue
        const key = name.toLowerCase()
        const existing = map.get(key)
        if (existing) existing.count++
        else map.set(key, { name, count: 1, last: d.delivered_at ?? null }) // first row = most recent
      }
      return [...map.values()].sort((a, b) => b.count - a.count)
    },
  })
}
