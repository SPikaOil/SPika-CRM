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
