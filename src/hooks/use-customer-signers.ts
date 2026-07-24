import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export type CustomerSigner = { name: string; count: number; last: string | null }

const norm = (n: string) => n.trim().toLowerCase()

// Known people who have signed for deliveries at a given customer, derived
// live from delivery history (no separate table needed — every completed
// delivery already stores signer_name). Most frequent first.
// Names an admin removed (customers.hidden_signers) are filtered out; the
// delivery records themselves are never modified — they hold the signature.
export function useCustomerSigners(customerId?: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer-signers', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<CustomerSigner[]> => {
      const { data: customer } = await supabase
        .from('customers')
        .select('hidden_signers')
        .eq('id', customerId!)
        .single()
      const hidden = new Set(
        (((customer as any)?.hidden_signers ?? []) as string[]).map(norm)
      )

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
        const key = norm(name)
        if (hidden.has(key)) continue
        const existing = map.get(key)
        if (existing) existing.count++
        else map.set(key, { name, count: 1, last: d.delivered_at ?? null }) // first row = most recent
      }
      return [...map.values()].sort((a, b) => b.count - a.count)
    },
  })
}

// Admin-only: drop a person from the signer suggestions for this customer.
// Adds the name to customers.hidden_signers — past deliveries keep their
// signer_name and signature, so delivery history stays provable.
export function useHideCustomerSigner() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ customerId, name }: { customerId: string; name: string }) => {
      const { data: customer, error: readError } = await supabase
        .from('customers')
        .select('hidden_signers')
        .eq('id', customerId)
        .single()
      if (readError) throw readError

      const current = (((customer as any)?.hidden_signers ?? []) as string[])
      if (current.some(n => norm(n) === norm(name))) return

      const { error } = await supabase
        .from('customers')
        .update({ hidden_signers: [...current, name.trim()] })
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: (_data, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customer-signers', customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers', customerId] })
      toast.success('Signer removed from this customer')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
