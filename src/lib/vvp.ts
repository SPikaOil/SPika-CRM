import { SupabaseClient } from '@supabase/supabase-js'

/**
 * What a bottle cost by the time it stood on the shelf.
 *
 * Her rule, 2026-08-21: "de VVP is de vvp van het product bij vertrek plus
 * vrachtkosten plus eventuele lokale kosten en plus opslagkosten", at the rate
 * of the intake day, spread per bottle — "per fles offcourse".
 *
 * Spread over what actually ARRIVED, never over what was sent. A colli that
 * never turns up is a loss, and hiding that loss inside the cost price of the
 * bottles that did arrive would quietly overstate every margin they earn. Her
 * instruction for the lost box says the same thing from the other side: its
 * costs land on the goods that did come in.
 *
 * The bottle's own cost comes from Products, which she made the source that
 * afternoon — "products is leidend hierin". The batch freezes it, so changing
 * the price today does not rewrite last month's warehouse value.
 */

export interface VvpInput {
  /** Cost of the leg, in the currency the costs were entered in. Null = not filled in. */
  freight: number | null
  local: number | null
  storage: number | null
  /** XCG per 1 unit of that currency. XCG itself is 1. */
  rate: number
  /** Bottles actually received off this transport, all products together. */
  bottlesReceived: number
}

export interface VvpBreakdown {
  /** The product's own cost per bottle, from Products. Null = not set yet. */
  product: number | null
  freight: number
  local: number
  storage: number
  /** Everything but the product, per bottle. */
  landed: number
  rate: number
  bottles: number
  at: string
}

/** The share of the leg that lands on ONE bottle. */
export function costPerBottle(input: VvpInput) {
  const { freight, local, storage, rate, bottlesReceived } = input
  if (bottlesReceived <= 0) {
    return { freight: 0, local: 0, storage: 0, landed: 0 }
  }
  const share = (amount: number | null) => ((amount ?? 0) * rate) / bottlesReceived
  const f = share(freight)
  const l = share(local)
  const s = share(storage)
  return { freight: f, local: l, storage: s, landed: f + l + s }
}

/**
 * The cost price of one intake batch.
 *
 * Returns null for the vvp itself when the product has no cost price yet —
 * every product in the catalogue is still empty. Guessing nought there would
 * put a bottle in the books at the price of its freight alone, which reads as
 * a real number and is not one. The breakdown is filled in either way, so a
 * screen can show what IS known and name what is missing.
 */
export function vvpFor(
  input: VvpInput,
  productVvp: number | null,
): { vvp: number | null; breakdown: VvpBreakdown } {
  const per = costPerBottle(input)
  const round = (n: number) => Math.round(n * 10000) / 10000
  return {
    vvp: productVvp === null ? null : round(productVvp + per.landed),
    breakdown: {
      product: productVvp,
      freight: round(per.freight),
      local: round(per.local),
      storage: round(per.storage),
      landed: round(per.landed),
      rate: input.rate,
      bottles: input.bottlesReceived,
      at: new Date().toISOString(),
    },
  }
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : Number(v)
}

/**
 * XCG per 1 unit of the currency the costs are in.
 *
 * XCG is 1 by definition. USD is pegged, so it takes the house rate from
 * company settings. Anything else floats and reads the daily rate — the same
 * table an invoice uses, so a freight bill and an invoice of the same day
 * convert identically.
 */
async function rateFor(supabase: SupabaseClient, currency: string): Promise<number> {
  if (!currency || currency === 'XCG') return 1

  if (currency === 'USD') {
    const { data } = await supabase
      .from('company_settings')
      .select('rate_usd')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle()
    return Number((data as { rate_usd?: number } | null)?.rate_usd ?? 1.75)
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('fx_rates')
    .select('rate_to_xcg')
    .eq('currency', currency)
    .lte('rate_date', today)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  // No rate on file is not a reason to book a bottle at nought. 1 leaves the
  // amount plainly unconverted, which somebody will notice.
  return Number((data as { rate_to_xcg?: number } | null)?.rate_to_xcg ?? 1)
}

/**
 * Work out the cost price of every batch that came in off one transport, and
 * write down why.
 *
 * Called after a goods receipt, after the costs change, and when a transport is
 * closed because a box is not coming. Always the whole transport at once: the
 * costs are shared, so one more box arriving changes the price of every batch
 * that landed before it.
 *
 * This is the "de VVP kan achteraf veranderen" half of her rule. A late invoice
 * three weeks on is the same call with a different reason.
 */
export async function recalcTransportVvp(
  supabase: SupabaseClient,
  transportId: string,
  reason: string,
): Promise<{ updated: number }> {
  const { data: transport } = await supabase
    .from('transports')
    .select('freight_cost, local_costs, storage_costs, costs_currency')
    .eq('id', transportId)
    .single()
  if (!transport) return { updated: 0 }

  const { data: batches } = await supabase
    .from('batches')
    .select('id, sku, vvp')
    .eq('transport_id', transportId)
  if (!batches || batches.length === 0) return { updated: 0 }

  // What was RECEIVED off this transport — not what is still standing. Bottles
  // already sold on carried their share of the freight when they landed, so
  // leaving them out would make the last bottle of a batch the expensive one.
  const { data: moves } = await supabase
    .from('stock_movements')
    .select('batch_id, qty')
    .eq('transport_id', transportId)
    .eq('reason', 'received')

  const bottlesReceived = (moves ?? []).reduce((s, m) => s + Number(m.qty), 0)
  if (bottlesReceived <= 0) return { updated: 0 }

  const { data: products } = await supabase
    .from('products')
    .select('sku, vvp')
    .in('sku', batches.map(b => b.sku as string))
  const productVvp = new Map(
    (products ?? []).map(p => [
      p.sku as string,
      p.vvp === null || p.vvp === undefined ? null : Number(p.vvp),
    ]),
  )

  const rate = await rateFor(
    supabase,
    (transport as { costs_currency?: string }).costs_currency ?? 'XCG',
  )

  let updated = 0
  for (const b of batches) {
    const id = b.id as string
    const { vvp, breakdown } = vvpFor(
      {
        freight: numOrNull((transport as Record<string, unknown>).freight_cost),
        local: numOrNull((transport as Record<string, unknown>).local_costs),
        storage: numOrNull((transport as Record<string, unknown>).storage_costs),
        rate,
        bottlesReceived,
      },
      productVvp.get(b.sku as string) ?? null,
    )

    const before = b.vvp === null || b.vvp === undefined ? null : Number(b.vvp)
    if (before === vvp) continue

    const { error } = await supabase
      .from('batches')
      .update({ vvp, vvp_breakdown: breakdown })
      .eq('id', id)
    if (error) continue

    await supabase.from('batch_cost_log').insert({
      batch_id: id,
      vvp_before: before,
      vvp_after: vvp,
      reason,
      breakdown,
    })
    updated++
  }

  return { updated }
}
