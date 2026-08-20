import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types'
import { useUsers } from '@/hooks/use-users'

/**
 * Who may be given an order — one rule, asked by every screen that offers names.
 *
 * Danique, 2026-08-20: "warehouse medewerkers van een bepaalde locatie kunnen
 * nooit een order van een andere locatie uitvoeren, dus die moeten dan ook niet
 * eens zichtbaar zijn. ook niet voor admin." And: "we kunnen enkel een order
 * toewijzen aan: actieve teamleden en teamleden in desbetreffende gebied."
 *
 * So the rule is two words long: ACTIVE, and AT THIS PLACE. Nothing about role
 * — she chose route A that same evening, "je hoort waar je aangevinkt bent,
 * punt", and Djamy is ticked at Curaçao like anyone else. One truth, the
 * checkboxes in Settings, instead of a second one hidden in code.
 *
 * It lives here and not in four screens because four copies drift. Order 729148
 * is what drift costs: a name from another island ended up on a Curaçao
 * delivery because one of those lists never got the rule.
 *
 * Note this narrows the CHOICES, never the display. A name already on an old
 * order still has to read as that name — see the trigger lookups on each screen,
 * which keep asking the full team list.
 */

/** NULL is Curaçao here, the same as everywhere else in this app (migration 093). */
export type Place = string | null

/**
 * Where an order is worked on.
 *
 * An order that travels to a warehouse belongs to that warehouse — that is what
 * a transport MEANS, and migration 102 already answers the same question inside
 * the database for the read policy. An order on no transport is a local Curaçao
 * order. An order split over two warehouses belongs to both, which is the point
 * of splitting it.
 */
export function useOrderPlaces(orderId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['order_places', orderId],
    queryFn: async (): Promise<Place[]> => {
      const { data, error } = await supabase
        .from('transport_orders')
        .select('transport:transports(ship_to, location_id)')
        .eq('order_id', orderId!)
      if (error) return [null]
      const places = (data ?? [])
        .map(r => (r as any).transport)
        .filter(t => t?.ship_to === 'warehouse' && t?.location_id)
        .map(t => t.location_id as string)
      const unique = Array.from(new Set(places))
      return unique.length > 0 ? unique : [null]
    },
    enabled: !!orderId,
  })
}

/**
 * Which places each team member is ticked at.
 *
 * NOT the useWarehouseMembers in use-transports.ts — that one answers "who may
 * be put IN CHARGE of a location" and reads roles. This one reads the ticks.
 * Two questions, two names, so they cannot be confused for each other.
 */
export function useMembersByPlace() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['warehouse_members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_members')
        .select('user_id, location_id')
      if (error) return [] as { user_id: string; location_id: string | null }[]
      return (data ?? []) as { user_id: string; location_id: string | null }[]
    },
  })
}

/**
 * The names that may be offered for work at these places.
 *
 * While anything is still loading this returns an empty list rather than
 * everybody: showing a name that the rule will reject is worse than showing
 * none for a moment.
 */
export function useAssignableAt(places: Place[]) {
  const { data: users, isLoading: usersLoading } = useUsers()
  const { data: members, isLoading: membersLoading } = useMembersByPlace()

  const here = new Set(
    (members ?? [])
      .filter(m => places.some(p => p === m.location_id))
      .map(m => m.user_id),
  )

  const data = (users ?? []).filter(
    u => (u as { is_active?: boolean }).is_active !== false && here.has(u.id),
  ) as User[]

  return { data, isLoading: usersLoading || membersLoading }
}

/** The names a screen may offer for an order that already exists. */
export function useAssignableUsers(orderId: string | null | undefined) {
  const { data: places, isLoading: placesLoading } = useOrderPlaces(orderId)
  const { data, isLoading } = useAssignableAt(places ?? [])
  return { data, isLoading: isLoading || placesLoading, places: places ?? [] }
}

/**
 * The names for an order that does not exist yet.
 *
 * A new order is written on Curaçao and has no transport, so it is a Curaçao
 * order until one is made for it — the same answer useOrderPlaces gives for an
 * order with nothing behind it. Without this, the one screen where an order
 * gets its FIRST name was the one screen without the rule.
 */
export function useAssignableForNewOrder() {
  return useAssignableAt([null])
}
