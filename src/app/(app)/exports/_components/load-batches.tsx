'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PackageMinus } from 'lucide-react'
import { BatchSelect } from '@/components/batch-select'
import { useTransportPicks, useSetTransportPick, useOrderPicksFor } from '@/hooks/use-batches'
import { Transport } from '@/types'
import { transportLoadLines } from '@/lib/transport-load'

/**
 * What comes off Curaçao for this transport, and out of which batch.
 *
 * Danique, 2026-08-19: "het moment dat we een transport aanmaken, dan is de
 * voorraad op Curacao al verminderd." A transport is a stock transfer, so this
 * is the moment the bottles leave home — not when a batch is picked on an
 * order, and not weeks later when a customer signs for them.
 *
 * That is also why the batch is chosen HERE for an export order and no longer
 * on the order page. Picking in both places would take the same bottles off the
 * shelf twice, and a warehouse count that is wrong by a whole load is worse than
 * no count at all.
 *
 * The quantity is what the orders on this transport have agreed to send — their
 * share, not their full order — so a part shipment takes off exactly what goes
 * in the container.
 *
 * A batch holds ONE best-before date (her rule: "1 partij kan maar 1 tht
 * hebben"), so choosing the batch settles the THT too. BatchSelect lists what is
 * really left on Curaçao and warns when a batch cannot cover the load; it never
 * blocks, because a load that carries more than is outstanding is a re-send of
 * goods that went missing.
 */
export function LoadBatches({ transport }: { transport: Transport }) {
  const { data: picks = {} } = useTransportPicks(transport.id)
  const setPick = useSetTransportPick()

  // What the ORDERS on this transport already took off Curaçao under the old
  // rule. Those bottles really did leave, so booking them out again here would
  // empty the shelf twice for one load.
  const { data: already = [] } = useOrderPicksFor((transport.orders ?? []).map(o => o.id))
  const oldPick = (sku: string) => already.find(p => p.sku === sku)

  // Per product, what this transport carries: the agreed share of every order
  // on it, added up. Shared with the status guard, which refuses to let the
  // transport leave while one of these has no batch — one list, so the guard
  // can never block a product this screen did not show.
  const lines = transportLoadLines(transport)
  const carried = new Set(lines.map(l => l.sku))

  // Everything already taken off the shelf for this transport, including a
  // product that has since been removed from the load — those bottles really
  // did leave, so they stay visible until somebody clears the batch.
  for (const [sku, p] of Object.entries(picks)) {
    if (!carried.has(sku)) lines.push({ sku, name: sku, qty: p.qty })
  }

  const off = lines.filter(l => picks[l.sku] || oldPick(l.sku)).length
  const open = lines.length - off
  const carriedOver = lines.filter(l => !picks[l.sku] && oldPick(l.sku)).length

  if (lines.length === 0) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PackageMinus className="h-4 w-4" />
            Off Curaçao
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing on this transport yet. Add an order below and the products it
            sends appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PackageMinus className="h-4 w-4" />
          Off Curaçao
          <span className={`ml-auto text-xs font-normal ${open > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
            {open > 0 ? `${open} still to pick` : 'all picked'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Choosing a batch takes these bottles off Curaçao straight away — they are
          on their way. The batch travels with them and is what the warehouse signs
          in at the other end.
        </p>

        {lines.map(l => {
          const old = !picks[l.sku] ? oldPick(l.sku) : undefined
          return (
            <div key={l.sku} className="flex items-center gap-2 flex-wrap">
              <span className="flex-1 min-w-0 truncate text-sm">{l.name}</span>
              <span className="text-xs text-muted-foreground shrink-0 w-14 text-right">
                {l.qty}
              </span>
              {old ? (
                // Already off the shelf, booked by the order under the old rule.
                // No picker: choosing one here would take the same bottles twice.
                <span className="text-xs text-muted-foreground w-52 shrink-0">
                  {old.batch_number} · already off via the order
                </span>
              ) : (
                <BatchSelect
                  className="w-52"
                  sku={l.sku}
                  needed={l.qty}
                  value={picks[l.sku]?.batch_id ?? null}
                  onChange={batchId => setPick.mutate({
                    transportId: transport.id, sku: l.sku, qty: l.qty, batchId,
                  })}
                />
              )}
            </div>
          )
        })}

        {carriedOver > 0 && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            {carriedOver} {carriedOver === 1 ? 'product' : 'products'} left Curaçao
            before this screen existed, booked out by the order itself. Those stay
            as they are — booking them again here would empty the shelf twice for
            one load.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
