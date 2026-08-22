import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * What each batch cost, landed.
 *
 * Its own table since migration 116: a warehouse member has to read batches to
 * sign goods in, and the cost price is not theirs to see. Row-level security
 * cannot hide a single column, so the money sits apart with its own rule.
 *
 * A warehouse account simply gets an empty list here, and every screen that
 * uses it already draws nothing when there is no number.
 */
export interface BatchCost {
  batch_id: string
  vvp: number | null
  breakdown: Record<string, unknown> | null
}

export function useBatchCosts() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['batch_costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_costs')
        .select('batch_id, vvp, breakdown')
      if (error) return [] as BatchCost[]
      return (data ?? []) as BatchCost[]
    },
  })
}
