import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Transport, TransportLocation, WarehouseDeliveryAddress, Carrier, Order, Colli, QuoteItem } from '@/types'
import { isExportCustomer } from '@/lib/country'
import { toast } from 'sonner'

/**
 * Which orders a transport is meant for comes through `transport_orders` since
 * migration 100 — a reference list, so the SAME order can be on two transports.
 * That is what a re-send after a lost load is, and `orders.transport_id` (one
 * column) could never express it.
 */
const TRANSPORT_SELECT =
  '*, carrier:carriers(*), location:transport_locations(*), delivery_address:warehouse_delivery_addresses(*), order_links:transport_orders(items, order:orders(*, customer:customers(*)))'

/** Flatten the join rows back into the plain `orders` every screen already reads. */
type TransportRow = Omit<Transport, 'orders'> & {
  order_links?: { items: QuoteItem[] | null; order: Order | null }[] | null
}

function withOrders(row: TransportRow): Transport {
  const orders = (row.order_links ?? [])
    .filter(l => !!l.order && !l.order.deleted_at)
    // `on_transport` is how much of that order travels on THIS transport — her
    // instruction of 2026-08-19, because it is not always the whole order. It
    // falls back to the order itself so a link written before the column
    // existed still reads as "all of it", which is what it meant.
    .map(l => ({
      ...(l.order as Order),
      on_transport: (l.items ?? []).length > 0
        ? (l.items as QuoteItem[])
        : ((l.order as Order).items ?? []) as QuoteItem[],
    }))
  const { order_links: _drop, ...rest } = row
  void _drop
  return { ...rest, orders } as Transport
}

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
      return ((data ?? []) as unknown as TransportRow[]).map(withOrders)
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
      return withOrders(data as unknown as TransportRow)
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
        .select(
          '*, customer:customers!inner(*), transport:transports(*), ' +
          // Every transport this order is named on, not just the last one (100).
          'transport_links:transport_orders(transport:transports(*))',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Filtered here rather than in the query: the country sits in a free-text
      // field inside the address, and isExportCustomer already knows how to
      // read "Curacao", "CURAÇAO " and "cw" as the same place. One rule, one
      // function, used by every screen — see lib/country.ts.
      type Row = Order & { transport_links?: { transport: Transport | null }[] | null }
      return ((data ?? []) as unknown as Row[])
        .filter(o => isExportCustomer(o.customer))
        .map(({ transport_links, ...o }) => ({
          ...o,
          transports: (transport_links ?? [])
            .map(l => l.transport)
            .filter((t): t is Transport => !!t)
            .sort((a, b) => b.transport_number.localeCompare(a.transport_number)),
        })) as Order[]
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
    // The transport number is ours to choose since 2026-08-19, and the column
    // is unique — so "already in use" is now a thing somebody will actually hit
    // by typing. Said in words rather than as Postgres' own
    // "duplicate key value violates unique constraint".
    onError: (err: Error) => toast.error(
      /duplicate key|23505/.test(err.message)
        ? 'That transport number is already in use'
        : err.message,
    ),
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
 * The packages of a TRANSPORT and what is in each of them (migration 100).
 *
 * The whole array is written at once: the number of colli is its length, so
 * adding a package and filling one are the same operation and cannot fall out
 * of step. It used to be written on the order, which printed the same boxes on
 * both transports the moment an order travelled twice.
 */
export function useSetTransportColli() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ transportId, colli }: { transportId: string; colli: Colli[] }) => {
      const { error } = await supabase
        .from('transports')
        .update({ colli_contents: colli })
        .eq('id', transportId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Every transport an order is named on, newest first (migration 100).
 *
 * Two of them is not a mistake — it is a load that went missing and was sent
 * again. The single-transport hook below cannot say that, which is why the
 * order page reads this one.
 */
export function useTransportsForOrder(orderId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transports', 'for-order-all', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transport_orders')
        .select('transport:transports(*, carrier:carriers(*))')
        .eq('order_id', orderId!)
      if (error) throw error
      return ((data ?? []) as unknown as { transport: Transport | null }[])
        .map(r => r.transport)
        .filter((t): t is Transport => !!t)
        .sort((a, b) => b.transport_number.localeCompare(a.transport_number))
    },
    enabled: !!orderId,
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

/**
 * Say that a transport is (also) meant for this order.
 *
 * A reference, not an allocation — no quantities change hands, and the same
 * order may be named by several transports. That is the whole point since
 * migration 100: send a load, lose it, send again, and both movements point at
 * the same order without either of them lying about the other.
 *
 * `orders.transport_id` is kept in step as the MOST RECENT transport, because
 * uitslag (bookOffWarehouse) still reads it. That dependency is untangled in
 * its own step; until then, dropping the column here would leave the warehouse
 * unable to book anything off at all.
 */
export function useAddOrderToTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, transportId }: { orderId: string; transportId: string }) => {
      // The whole order to begin with, because that is the ordinary case and
      // nobody should have to retype it. Cut down by hand for a part shipment.
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('items')
        .eq('id', orderId)
        .single()
      if (orderErr) throw orderErr

      const { error } = await supabase
        .from('transport_orders')
        .upsert({
          order_id: orderId,
          transport_id: transportId,
          items: (order?.items ?? []) as QuoteItem[],
        }, {
          onConflict: 'transport_id,order_id',
          ignoreDuplicates: true,
        })
      if (error) throw error
      const { error: syncErr } = await supabase
        .from('orders')
        .update({ transport_id: transportId })
        .eq('id', orderId)
      if (syncErr) throw syncErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * How much of an order travels on this transport.
 *
 * Her instruction of 2026-08-19: "per order die we in het transport selecteren,
 * dienen we zelf aan te geven hoeveel items mee zijn. Is niet altijd de hele
 * order." Said out loud, not worked out from the boxes — the quantity is agreed
 * before anything is packed, and the packing is checked against it afterwards.
 */
export function useSetTransportOrderItems() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, transportId, items }: {
      orderId: string; transportId: string; items: QuoteItem[]
    }) => {
      const { error } = await supabase
        .from('transport_orders')
        .update({ items })
        .eq('order_id', orderId)
        .eq('transport_id', transportId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Take an order off one transport. Its other transports are untouched — that is
 * the difference from the old single column, which could only ever forget all
 * of them at once.
 */
export function useRemoveOrderFromTransport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, transportId }: { orderId: string; transportId: string }) => {
      const { error } = await supabase
        .from('transport_orders')
        .delete()
        .eq('order_id', orderId)
        .eq('transport_id', transportId)
      if (error) throw error

      // Point the legacy column at whatever transport the order is still on —
      // the most recent one — or clear it when it is on none.
      const { data: left, error: leftErr } = await supabase
        .from('transport_orders')
        .select('transport_id, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (leftErr) throw leftErr
      const { error: syncErr } = await supabase
        .from('orders')
        .update({ transport_id: left?.[0]?.transport_id ?? null })
        .eq('id', orderId)
      if (syncErr) throw syncErr
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
 * The doors a warehouse receives at (migration 095).
 *
 * A warehouse has one physical address; this is where the goods actually land.
 * DPD and the others drop part of a load elsewhere and the warehouse collects
 * it there, so there can be several per warehouse and the transport says which
 * one this load used.
 */
export function useWarehouseDeliveryAddresses() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['warehouse_delivery_addresses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_delivery_addresses')
        .select('*')
        .order('label')
      if (error) throw error
      return data as WarehouseDeliveryAddress[]
    },
  })
}

export function useSaveWarehouseDeliveryAddress() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Partial<WarehouseDeliveryAddress> }) => {
      const { data, error } = id
        ? await supabase.from('warehouse_delivery_addresses').update(values).eq('id', id).select().single()
        : await supabase.from('warehouse_delivery_addresses').insert(values).select().single()
      if (error) throw error
      return data as WarehouseDeliveryAddress
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse_delivery_addresses'] })
      toast.success('Delivery address saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Remove a delivery address.
 *
 * Refused while a transport still points at it. The foreign key would null the
 * column instead, which would silently move a load back to the warehouse
 * address after its papers were printed from another one.
 */
export function useDeleteWarehouseDeliveryAddress() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from('transports')
        .select('*', { count: 'exact', head: true })
        .eq('delivery_address_id', id)
      if ((count ?? 0) > 0) {
        throw new Error(`Still in use by ${count} transport(s).`)
      }
      const { error } = await supabase.from('warehouse_delivery_addresses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse_delivery_addresses'] })
      toast.success('Delivery address removed')
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
