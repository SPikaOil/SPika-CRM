import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PosRequest, QuoteItem } from '@/types'
import { posOrderLine } from '@/lib/marketing'
import { toast } from 'sonner'

/** Same shape as the marketing hook: absent table falls back so screens render. */
function tableMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return /pos_requests/i.test(msg) && /does not exist|not find/i.test(msg)
}

/** PREVIEW ONLY — goes away with migration 073, like the marketing demo rows. */
const DEMO_REQUESTS: PosRequest[] = [
  {
    id: 'demo-req-1', created_at: new Date(Date.now() - 2 * 864e5).toISOString(), updated_at: '',
    customer_id: 'demo-cust-1', asset_id: 'demo-1', qty: 3,
    note: 'For all three shelves in the Zeelandia branch.', status: 'open',
    asset: { id: 'demo-1', title: 'Shelf talker — SPika Oil 100ml', category: 'pos' },
    customer: { id: 'demo-cust-1', company_name: 'Carrefour Market' },
  },
  {
    id: 'demo-req-2', created_at: new Date(Date.now() - 5 * 864e5).toISOString(), updated_at: '',
    customer_id: 'demo-cust-1', asset_id: 'demo-3', qty: 1,
    note: null, status: 'open',
    asset: { id: 'demo-3', title: 'Poster A2 — Taste the island', category: 'pos' },
    customer: { id: 'demo-cust-1', company_name: 'Carrefour Market' },
  },
  {
    id: 'demo-req-3', created_at: new Date(Date.now() - 12 * 864e5).toISOString(), updated_at: '',
    customer_id: 'demo-cust-2', asset_id: 'demo-2', qty: 2,
    note: 'Next to the register.', status: 'planned',
    asset: { id: 'demo-2', title: 'Wobbler — round, 8cm', category: 'pos' },
    customer: { id: 'demo-cust-2', company_name: 'De Fles' },
  },
]

const SELECT = '*, asset:marketing_assets(id, title, category), customer:customers(id, company_name)'

/**
 * @param scope  'open' for the dashboard counter, a customer id for that
 *               customer's list, or 'mine' for the portal (RLS narrows it).
 */
export function usePosRequests(scope: 'open' | 'all' | 'mine' | { customerId: string }) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['pos-requests', typeof scope === 'string' ? scope : scope.customerId],
    queryFn: async () => {
      let query = supabase.from('pos_requests').select(SELECT).order('created_at', { ascending: false })

      if (scope === 'open') query = query.eq('status', 'open')
      if (typeof scope === 'object') query = query.eq('customer_id', scope.customerId)

      const { data, error } = await query
      if (error) {
        if (tableMissing(error)) {
          if (scope === 'open') return DEMO_REQUESTS.filter(r => r.status === 'open')
          if (typeof scope === 'object') return DEMO_REQUESTS.filter(r => r.customer_id === 'demo-cust-1')
          return DEMO_REQUESTS
        }
        throw error
      }
      return data as PosRequest[]
    },
  })
}

/** The portal side: a reseller asking for something. */
export function useCreatePosRequest() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      customer_id: string
      asset_id: string
      qty: number
      note?: string
      // For the e-mail only — never written to the row.
      customerName?: string
      assetTitle?: string
      outOfStock?: boolean
    }) => {
      const { customerName, assetTitle, outOfStock, ...row } = values
      const { error } = await supabase.from('pos_requests').insert({ ...row, status: 'open' })
      if (error) throw error
      return { customerName, assetTitle, outOfStock, qty: row.qty, note: row.note }
    },
    onSuccess: (mail) => {
      queryClient.invalidateQueries({ queryKey: ['pos-requests'] })
      toast.success('Thank you — we will send it with your next order.')
      // The row is written first, so a mail problem can never lose the request.
      // The send itself is awaited inside the route.
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pos_request',
          payload: {
            customerName: mail.customerName ?? 'A reseller',
            assetTitle: mail.assetTitle ?? 'POS material',
            qty: mail.qty,
            note: mail.note ?? '',
            outOfStock: mail.outOfStock ?? false,
          },
        }),
      }).catch(() => {})
    },
    // Never silent: a request that vanishes is worse than one that fails loudly.
    onError: (err: Error) => toast.error(err.message || 'Could not send your request'),
  })
}

/**
 * Put a request on an order as a free line.
 *
 * Appends rather than replaces, and refuses a duplicate line, so pressing the
 * button twice cannot invoice the same shelf talker twice.
 */
export function useGrantPosRequest() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ request, orderId, currentItems }: {
      request: PosRequest
      orderId: string
      currentItems: QuoteItem[]
    }) => {
      const line = posOrderLine(request.asset?.title ?? 'POS material', request.qty)
      const already = currentItems.some(i => i.sku === line.sku)
      const items = already ? currentItems : [...currentItems, line as QuoteItem]

      if (!already) {
        const { error: orderErr } = await supabase.from('orders').update({ items }).eq('id', orderId)
        if (orderErr) throw orderErr
      }

      const { error } = await supabase
        .from('pos_requests')
        .update({ status: 'planned', order_id: orderId, handled_at: new Date().toISOString() })
        .eq('id', request.id)
      if (error) throw error
      return { already }
    },
    onSuccess: ({ already }) => {
      queryClient.invalidateQueries({ queryKey: ['pos-requests'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success(already ? 'Already on this order — request linked' : 'Added to this order as a free line')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeclinePosRequest() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('pos_requests')
        .update({ status: 'declined', decline_reason: reason, handled_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-requests'] })
      toast.success('Request declined — the reseller can see the reason')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
