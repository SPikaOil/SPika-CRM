import { SupabaseClient } from '@supabase/supabase-js'

/**
 * The batch a warehouse holds, made the moment goods are signed in.
 *
 * Her rule, 2026-08-20: a production batch and a warehouse batch are two
 * different batches, linked. They have to be, because they cost different
 * amounts — the freight, the local costs and the storage of the leg to
 * Rotterdam land on the bottles that arrived there, not on the ones still
 * standing on Curaçao, and one batch cannot carry two cost prices.
 *
 * Numbered parent-transport-warehouse: SPGE22-20260722-NBC, her order of
 * 2026-08-20 ("draai het om"). The parent stays readable inside the number, so
 * a bottle in a shop still points back at the day it was filled.
 *
 * Found before it is made. A second colli of the same load carrying the same
 * product is the same arrival of the same goods; opening a second batch for it
 * would split one shelf in two. Migration 110 refuses that in the database as
 * well, so two people signing two boxes in at the same second cannot both win.
 */
export async function intakeBatchFor(
  supabase: SupabaseClient,
  args: {
    parentBatchId: string
    transportId: string
    locationId: string | null
    sku: string
  },
): Promise<string> {
  const { parentBatchId, transportId, locationId, sku } = args

  /**
   * NULL is Curaçao, and `= null` matches nothing in SQL — it has to be IS
   * NULL. Getting that wrong does not fail loudly; it silently finds nothing
   * and opens a second batch on every box.
   */
  function findExisting() {
    const q = supabase
      .from('batches')
      .select('id')
      .eq('parent_batch_id', parentBatchId)
      .eq('transport_id', transportId)
    return (locationId === null ? q.is('location_id', null) : q.eq('location_id', locationId))
      .maybeSingle()
  }

  const found = await findExisting()
  if (found.data?.id) return found.data.id as string

  const [{ data: parent }, { data: transport }, { data: place }] = await Promise.all([
    supabase.from('batches').select('batch_number, tht_date').eq('id', parentBatchId).single(),
    supabase.from('transports').select('transport_number').eq('id', transportId).single(),
    locationId
      ? supabase.from('transport_locations').select('code, name').eq('id', locationId).single()
      : Promise.resolve({ data: null }),
  ])

  const where = place ? ((place as { code?: string; name: string }).code || (place as { name: string }).name) : 'CUR'
  const number = [
    (parent as { batch_number: string } | null)?.batch_number ?? 'BATCH',
    (transport as { transport_number: string } | null)?.transport_number ?? '',
    where,
  ].filter(Boolean).join('-')

  const { data, error } = await supabase
    .from('batches')
    .insert({
      batch_number: number,
      sku,
      // One batch, one best-before — her rule. The bottles are the same bottles,
      // so the date travels with them rather than being typed again.
      tht_date: (parent as { tht_date: string | null } | null)?.tht_date ?? null,
      parent_batch_id: parentBatchId,
      location_id: locationId,
      transport_id: transportId,
      notes: '',
    })
    .select('id')
    .single()

  if (error) {
    // Somebody else signed the other box in first. Their batch is the one to
    // use — this is the race the unique index exists for.
    const retry = await findExisting()
    if (retry.data?.id) return retry.data.id as string
    throw new Error(error.message)
  }

  return data!.id as string
}

/**
 * The batch a HANDOVER creates at the other end.
 *
 * The same idea as a transport arriving at a warehouse: what lands becomes a
 * batch of its own, pointing back at the one it came out of. The destination
 * can be a place or a pair of hands — a team member carrying bottles is a stock
 * location like any other since migration 112.
 *
 * Numbered parent-date-where, matching the transport form: SPGE22-20260821-DJA.
 * Three letters for the person or the warehouse, her rule of 2026-08-21.
 *
 * Without this, signing for a handover booked the bottles onto the warehouse
 * the receiver happened to be ticked at — so Djamy handed his fifty straight
 * back to Curaçao and the island count never moved — or, for somebody ticked
 * nowhere, booked nothing at all and lost them.
 */
export async function handoverBatchFor(
  supabase: SupabaseClient,
  args: {
    parentBatchId: string
    handoverId: string
    /** Where they land. Null with a holder means the person carries them. */
    locationId: string | null
    /** Whose hands they land in. Null means the place itself holds them. */
    holderId: string | null
    sku: string
    /** The day of the handover, for the number. */
    on: string
  },
): Promise<string> {
  const { parentBatchId, handoverId, locationId, holderId, sku, on } = args

  const found = await supabase
    .from('batches')
    .select('id')
    .eq('parent_batch_id', parentBatchId)
    .eq('handover_batch_id', handoverId)
    .maybeSingle()
  if (found.data?.id) return found.data.id as string

  const [{ data: parent }, { data: place }, { data: person }] = await Promise.all([
    supabase.from('batches').select('batch_number, tht_date').eq('id', parentBatchId).single(),
    locationId
      ? supabase.from('transport_locations').select('code, name').eq('id', locationId).single()
      : Promise.resolve({ data: null }),
    holderId
      ? supabase.from('team_members').select('name').eq('id', holderId).single()
      : Promise.resolve({ data: null }),
  ])

  const short = (s: string) => s.trim().slice(0, 3).toUpperCase()
  const where = holderId
    ? short((person as { name?: string } | null)?.name ?? 'WHO')
    : place
      ? ((place as { code?: string; name: string }).code || short((place as { name: string }).name))
      : 'CUR'

  const number = [
    (parent as { batch_number: string } | null)?.batch_number ?? 'BATCH',
    on.replace(/-/g, ''),
    where,
  ].filter(Boolean).join('-')

  const { data, error } = await supabase
    .from('batches')
    .insert({
      batch_number: number,
      sku,
      tht_date: (parent as { tht_date: string | null } | null)?.tht_date ?? null,
      parent_batch_id: parentBatchId,
      location_id: locationId,
      holder_id: holderId,
      handover_batch_id: handoverId,
      notes: '',
    })
    .select('id')
    .single()

  if (error) {
    const retry = await supabase
      .from('batches')
      .select('id')
      .eq('parent_batch_id', parentBatchId)
      .eq('handover_batch_id', handoverId)
      .maybeSingle()
    if (retry.data?.id) return retry.data.id as string
    throw new Error(error.message)
  }

  return data!.id as string
}
