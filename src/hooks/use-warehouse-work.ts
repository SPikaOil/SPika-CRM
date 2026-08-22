import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * The work waiting at a warehouse, as opposed to the work waiting for a person.
 *
 * Danique, 2026-08-20: a warehouse member "ziet nu alleen runs die aan hém
 * toegewezen zijn" — so a run standing at their shelf with nobody's name on it
 * was invisible to the very people standing next to it. These two hooks ask the
 * question the other way round: what is at this PLACE.
 */

export interface OpenRunAtLocation {
  id: string
  order_id: string
  planned_date: string | null
  assigned_to: string | null
  items: { sku: string; name: string; qty: number }[] | null
  order: {
    order_number: string
    customer: { company_name: string } | null
  } | null
}

/**
 * Runs still to go out for these orders, whoever is on them.
 *
 * The caller works out which orders belong to their warehouse — that answer
 * already lives in the transports they can see — and this turns it into the
 * runs. An empty list of orders asks nothing at all rather than asking for
 * everything.
 */
export function useOpenRunsForOrders(orderIds: string[]) {
  const supabase = createClient()
  const key = [...orderIds].sort().join(',')
  return useQuery({
    queryKey: ['open_runs_at_location', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, order_id, planned_date, assigned_to, items, order:orders(order_number, customer:customers(company_name))')
        .in('order_id', orderIds)
        .is('delivered_at', null)
        .order('planned_date', { ascending: true })
      if (error) return [] as OpenRunAtLocation[]
      return (data ?? []) as unknown as OpenRunAtLocation[]
    },
    enabled: orderIds.length > 0,
  })
}

export interface IncomingHandover {
  id: string
  created_at: string
  handover_date: string | null
  from_location_id: string | null
  /** Where it is going when that is a place rather than a person (mig 117). */
  to_location_id: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  items: { sku: string; name: string; qty: number }[]
  signed_at: string | null
  /** When it really left. Null = asked for, still on the sending shelf. */
  sent_at: string | null
}

/**
 * Handovers on their way to this person, still unsigned.
 *
 * Migration 069 turned a handover into the way stock travels between any two
 * places, including by post — so between it leaving one shelf and being signed
 * for at the next, the bottles are in neither count. That gap is exactly what
 * somebody wants to see on the morning it lands.
 */
export function useIncomingHandovers(
  userId: string | null | undefined,
  /** The warehouses this person works at. Curaçao is null and is skipped here. */
  locationIds: (string | null)[] = [],
) {
  const supabase = createClient()
  const places = locationIds.filter((l): l is string => !!l)
  const key = [userId, ...places.sort()].join(',')
  return useQuery({
    queryKey: ['incoming_handovers', key],
    queryFn: async () => {
      /**
       * On its way TO you: addressed to you by name, or to a warehouse you work
       * at (migration 117).
       *
       * Her reason for the whole thing: "dit zou niet moeten zijn dat ik
       * warehouse b ga mailen of bellen." A load ordered to warehouse B has to
       * turn up on warehouse B's own screen, and nobody at B is named on it.
       *
       * Only what has really been SENT. Something merely asked for is still
       * standing at the other end; putting it here would have somebody waiting
       * at the door for a box nobody has packed.
       */
      const clauses = [`member_id.eq.${userId}`]
      if (places.length > 0) clauses.push(`to_location_id.in.(${places.join(',')})`)

      const { data, error } = await supabase
        .from('handover_batches')
        .select('id, created_at, handover_date, from_location_id, to_location_id, tracking_number, tracking_carrier, items, signed_at, sent_at')
        .or(clauses.join(','))
        .not('sent_at', 'is', null)
        .is('signed_at', null)
        .order('created_at', { ascending: false })
      if (error) return [] as IncomingHandover[]
      return (data ?? []) as IncomingHandover[]
    },
    enabled: !!userId,
  })
}

/**
 * Asked for, and still standing on YOUR shelf.
 *
 * The other half of her case: an admin orders warehouse A to send bottles to
 * warehouse B, and A has to see that they are expected to pack it. Until they
 * press send the bottles have not moved, which is exactly why it is a separate
 * list from the one above.
 */
export function useHandoversToSend(locationIds: (string | null)[]) {
  const supabase = createClient()
  const places = locationIds.filter((l): l is string => !!l)
  const key = places.sort().join(',')
  return useQuery({
    queryKey: ['handovers_to_send', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('handover_batches')
        .select('id, created_at, handover_date, from_location_id, to_location_id, tracking_number, tracking_carrier, items, signed_at, sent_at')
        .in('from_location_id', places)
        .is('sent_at', null)
        .order('created_at', { ascending: false })
      if (error) return [] as IncomingHandover[]
      return (data ?? []) as IncomingHandover[]
    },
    enabled: places.length > 0,
  })
}
