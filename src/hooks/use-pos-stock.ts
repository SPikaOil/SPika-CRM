import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export type PosReason = 'received' | 'transport_out' | 'to_customer' | 'return' | 'adjustment'

export const POS_REASONS: { key: PosReason; label: string; sign: 1 | -1 }[] = [
  { key: 'received',      label: 'Received at a location', sign: 1 },
  { key: 'return',        label: 'Came back',              sign: 1 },
  { key: 'transport_out', label: 'Left on a transport',    sign: -1 },
  { key: 'to_customer',   label: 'Handed to a reseller',   sign: -1 },
  { key: 'adjustment',    label: 'Correction',             sign: 1 },
]

export interface PosStockRow {
  pos_item_id: string
  item_name: string
  item_kind: string
  location_id: string | null
  qty: number
}

/**
 * What POS material is where.
 *
 * A view over the movements, not a stored total — the same rule the bottles
 * follow. A number you can only change by recording why it changed cannot
 * silently drift away from reality.
 */
export function usePosStock() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['pos-stock'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pos_stock').select('*')
      // Missing before migration 092. An empty stock is the honest answer.
      if (error) return [] as PosStockRow[]
      return (data ?? []) as PosStockRow[]
    },
  })
}

export interface PosMovement {
  id: string
  created_at: string
  pos_item_id: string
  qty: number
  location_id: string | null
  reason: PosReason
  order_id: string | null
  transport_id: string | null
  customer_id: string | null
  note: string
}

export function usePosMovements(posItemId?: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['pos-movements', posItemId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('pos_movements').select('*').order('created_at', { ascending: false }).limit(200)
      if (posItemId) q = q.eq('pos_item_id', posItemId)
      const { data, error } = await q
      if (error) return [] as PosMovement[]
      return (data ?? []) as PosMovement[]
    },
  })
}

export function useRecordPosMovement() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      pos_item_id: string
      /** Always positive from the caller — the reason decides the direction. */
      qty: number
      reason: PosReason
      location_id?: string | null
      order_id?: string | null
      transport_id?: string | null
      customer_id?: string | null
      note?: string
    }) => {
      // A correction is the one reason that carries its own direction: counting
      // a shelf can find fewer OR more than the screen says. Every other reason
      // knows which way it goes, so the caller passes a plain positive number.
      const def = POS_REASONS.find(r => r.key === input.reason)
      const signed = input.reason === 'adjustment'
        ? input.qty
        : Math.abs(input.qty) * (def?.sign ?? 1)
      if (signed === 0) throw new Error('A movement of nothing is not a movement')

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('pos_movements').insert({
        ...input,
        qty: signed,
        created_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-stock'] })
      queryClient.invalidateQueries({ queryKey: ['pos-movements'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * A correction sets the stock TO a number rather than by one.
 *
 * Counting a shelf gives you "there are nine", never "there are two fewer than
 * whatever the screen said". So the caller passes what they counted and this
 * works out the difference — and records it as a movement, so the correction
 * itself is visible rather than the number quietly changing.
 */
export function useCorrectPosStock() {
  const record = useRecordPosMovement()

  return {
    ...record,
    correctTo: (args: { pos_item_id: string; location_id: string | null; counted: number; current: number; note?: string }) => {
      const diff = args.counted - args.current
      if (diff === 0) { toast.info('That is what it already said'); return }
      record.mutate({
        pos_item_id: args.pos_item_id,
        location_id: args.location_id,
        qty: diff,
        reason: 'adjustment',
        note: args.note || `Counted ${args.counted}, was ${args.current}`,
      })
    },
  }
}
