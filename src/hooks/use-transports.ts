import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Transport, TransportLocation, Carrier, Order, Colli } from '@/types'
import { isExportCustomer } from '@/lib/country'
import { toast } from 'sonner'

const TRANSPORT_SELECT =
  '*, carrier:carriers(*), location:transport_locations(*), orders:orders(*, customer:customers(*))'

export function useTransports() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transports')
        .select(TRANSPORT_SELECT)
        .order('transport_number', { ascending: false })
      if (error) throw error
      return data as Transport[]
    },
  })
}

export function useTransport(id: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transports', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transports')
        .select(TRANSPORT_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Transport
    },
    enabled: !!id,
  })
}

/**
 * Every order that leaves Curaçao — that IS the export list. There is no
 * separate export record to keep in step, and since 2026-08-15 no switch to
 * forget either: an order is an export because the delivery address is not
 * Curaçao. Deleted orders are left out; anything else, including orders already
 * on a transport, is returned so the Export tab can group them.
 */
export function useExportOrders() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['export-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customer:customers!inner(*), transport:transports(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Filtered here rather than in the query: the country sits in a free-text
      // field inside the address, and isExportCustomer already knows how to
      // read "Curacao", "CURAÇAO " and "cw" as the same place. One rule, one
      // function, used by every screen — see lib/country.ts.
      return ((data ?? []) as Order[]).filter(o => isExportCustomer(o.customer))
    },
  })
}

export function useTransportLocations() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transport_locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transport_locations')
        .select('*, user:users(id, name, email)')
        .order('name')
      if (error) throw error
      return data as TransportLocation[]
    },
  })
}

/**
 * Who may be put in charge of a location: whoever physically holds our bottles.
 *
 * Danique, 2026-08-14: "het moet niet kunnen dat ik gewoon who ever kan
 * invullen, want anders ben je de controle kwijt uit deze app." So it is a
 * warehouse member or a sales member — a sales member driving around with stock
 * in the boot is holding stock just as much as a warehouse is. Nobody else. The
 * database refuses the rest as well (migrations 066 and 068); this only keeps
 * the screen from offering a choice that would be rejected.
 */
export function useWarehouseMembers() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['warehouse_members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, is_active')
        .in('role', ['warehouse', 'sales'])
        .order('name')
      if (error) throw error
      return (data ?? []).filter(u => (u as { is_active?: boolean }).is_active !== false) as
        { id: string; name: string; email: string; role: string }[]
    },
  })
}

export function useCreateTransportLocation() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<TransportLocation>) => {
      const { data, error } = await supabase
        .from('transport_locations')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as TransportLocation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transport_locations'] })
      toast.success('Location added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * The transport number is handed out by the database (next_transport_number),
 * not built here — two people creating a transport in the same minute would
 * otherwise land on the same YYYYMM counter.
 */
export function useCreateTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Transport> = {}) => {
      const { data: number, error: numberError } = await supabase.rpc('next_transport_number')
      if (numberError) throw numberError

      const { data, error } = await supabase
        .from('transports')
        .insert({ ...values, transport_number: number })
        .select()
        .single()
      if (error) throw error
      return data as Transport
    },
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      toast.success(`Transport ${t.transport_number} created`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Transport> }) => {
      const { data, error } = await supabase
        .from('transports')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Transport
    },
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['transports', id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Orders survive — the FK is ON DELETE SET NULL, so they simply drop back
      // to "not on a transport yet". Removing a transport must never touch an
      // order's own record.
      const { error } = await supabase.from('transports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
      toast.success('Transport removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * The packages of an order and what is in each of them. The whole array is
 * written at once: the number of colli is its length, so adding a package and
 * filling one are the same operation and cannot fall out of step.
 */
export function useSetOrderColli() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, colli }: { orderId: string; colli: Colli[] }) => {
      const { error } = await supabase
        .from('orders')
        .update({ colli_contents: colli })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** The transport an order sits on, for the read-only card on the order page. */
export function useTransportForOrder(transportId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transports', 'for-order', transportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transports')
        .select('*, carrier:carriers(*)')
        .eq('id', transportId!)
        .maybeSingle()
      if (error) throw error
      return data as Transport | null
    },
    enabled: !!transportId,
  })
}

/** Put an order on a transport, or take it off again by passing null. */
export function useSetOrderTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, transportId }: { orderId: string; transportId: string | null }) => {
      const { error } = await supabase
        .from('orders')
        .update({ transport_id: transportId })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Carriers ────────────────────────────────────────────────────────────────
// Managed under Settings by an admin. Until migration 054 the carriers table
// had a read policy and nothing else, so the three rows that existed could
// never be changed from the app at all.

export function useCarriers() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('carriers').select('*').order('name')
      if (error) throw error
      return data as Carrier[]
    },
  })
}

export function useSaveCarrier() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Partial<Carrier> }) => {
      const query = id
        ? supabase.from('carriers').update(values).eq('id', id)
        : supabase.from('carriers').insert(values)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] })
      toast.success(id ? 'Carrier updated' : 'Carrier added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteCarrier() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('carriers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] })
      toast.success('Carrier removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Edit a warehouse. Locations were create-only, and only from inside a
 * transport — so a typo in a name lived forever and there was no way to fill in
 * an address afterwards. Her note of 2026-08-16: this belongs on the Warehouse
 * tab, which is where you are when you think about a warehouse.
 */
export function useUpdateTransportLocation() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<TransportLocation> }) => {
      const { error } = await supabase.from('transport_locations').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transport_locations'] })
      toast.success('Location updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Remove a warehouse.
 *
 * Refused while anything still points at it. transports.location_id and
 * stock_movements.location_id both reference this table, so deleting one that
 * is in use would either fail on the constraint or orphan a stock figure —
 * better to say which it is than to let Postgres phrase it.
 */
export function useDeleteTransportLocation() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const [{ count: transports }, { count: movements }, { count: posMovements }] = await Promise.all([
        supabase.from('transports').select('*', { count: 'exact', head: true }).eq('location_id', id),
        supabase.from('stock_movements').select('*', { count: 'exact', head: true }).eq('location_id', id),
        supabase.from('pos_movements').select('*', { count: 'exact', head: true }).eq('location_id', id),
      ])
      const used = (transports ?? 0) + (movements ?? 0) + (posMovements ?? 0)
      if (used > 0) {
        throw new Error(
          `Still in use: ${transports ?? 0} transport(s), ${movements ?? 0} stock movement(s), ${posMovements ?? 0} POS movement(s).`,
        )
      }
      const { error } = await supabase.from('transport_locations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transport_locations'] })
      toast.success('Location removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Which team members work at which warehouse.
 *
 * location_id NULL means Curaçao, the same convention the stock uses. Separate
 * from transport_locations.user_id, which is the one person in CHARGE — being
 * in charge and working somewhere are different facts.
 */
export interface WarehouseMemberRow {
  id: string
  user_id: string
  location_id: string | null
}

export function useWarehouseMemberships() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['warehouse_memberships'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouse_members').select('id, user_id, location_id')
      // Missing before migration 093. Nobody is a member of anything yet, which
      // is what an empty list says.
      if (error) return [] as WarehouseMemberRow[]
      return (data ?? []) as WarehouseMemberRow[]
    },
  })
}

export function useSetWarehouseMember() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, locationId, member }: {
      userId: string; locationId: string | null; member: boolean
    }) => {
      if (member) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('warehouse_members')
          .insert({ user_id: userId, location_id: locationId, created_by: user?.id ?? null })
        if (error) throw error
      } else {
        let q = supabase.from('warehouse_members').delete().eq('user_id', userId)
        // .eq() never matches NULL — Curaçao needs .is(), and getting this wrong
        // would silently remove nobody.
        q = locationId === null ? q.is('location_id', null) : q.eq('location_id', locationId)
        const { error } = await q
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouse_memberships'] }),
    onError: (err: Error) => toast.error(err.message),
  })
}
