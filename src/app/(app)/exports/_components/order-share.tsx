'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Order, QuoteItem } from '@/types'
import { useSetTransportOrderItems } from '@/hooks/use-transports'
import { isPosLine } from '@/lib/pos'

/**
 * How much of one order travels on this transport.
 *
 * Danique, 2026-08-19: "per order die we in het transport selecteren, dienen we
 * zelf aan te geven hoeveel items mee zijn. Is niet altijd de hele order."
 *
 * It is SAID here, not worked out from the boxes. The quantity is agreed when
 * the load is planned — long before anybody tapes a carton shut — and the
 * packing is checked against it afterwards rather than the other way round.
 * Reading it back off the colli would leave a transport with nothing packed yet
 * claiming it carries nothing, which is not what was agreed at all.
 *
 * It starts as the whole order, because that is the ordinary case. Cutting it
 * down is one number per line.
 *
 * This lived here before as a side effect of the packing: colli hung on the
 * ORDER, so packing 43 of 130 bottles was how you said it. Moving the boxes to
 * the transport (migration 100) took the boxes to the right place and took this
 * with it by accident. Now it is its own thing, which is what it should have
 * been.
 */
export function OrderShare({ order, transportId }: { order: Order; transportId: string }) {
  const save = useSetTransportOrderItems()

  /**
   * The PRODUCTS of this order, without the POS material.
   *
   * Danique, 2026-08-20: POS was showing up twice inside one card — once as a
   * quantity here and once in the POS box right underneath, both read off the
   * same order lines. And a quantity is the wrong question for a stand: you do
   * not send four fifths of a display, it goes along or it does not. So POS has
   * one place, and this is not it.
   *
   * It is still STORED in the allocation below, untouched, because the packing
   * check compares the boxes against what this run is meant to carry — and a
   * stand in a box has to count as expected rather than as a surprise.
   */
  const ordered = ((order.items ?? []) as QuoteItem[]).filter(i => i.qty > 0 && !isPosLine(i))
  const onBoard = (order.on_transport ?? []) as QuoteItem[]
  const qtyOf = (sku: string) => onBoard.find(i => i.sku === sku)?.qty ?? 0

  if (ordered.length === 0) return null

  /** Write the whole allocation at once — one row, one truth. */
  function write(next: QuoteItem[]) {
    // POS lines are not editable here, so they are carried over as they were
    // rather than quietly dropped by a screen that never showed them.
    const pos = onBoard.filter(isPosLine)
    save.mutate({
      orderId: order.id,
      transportId,
      // Lines set to zero are dropped rather than stored as zeroes: "not on this
      // transport" and "nought of it on this transport" are the same thing, and
      // one of the two spellings is enough.
      items: [...next.filter(i => !isPosLine(i) && i.qty > 0), ...pos],
    })
  }

  function setQty(sku: string, value: number) {
    const line = ordered.find(i => i.sku === sku)
    if (!line) return
    // Never more than was ordered on THIS line. Sending more than the customer
    // bought is a re-send of a lost load, and that is a second transport with
    // its own share — not a bigger number on this one.
    const qty = Math.max(0, Math.min(Math.round(value), line.qty))
    const rest = onBoard.filter(i => i.sku !== sku)
    write([...rest, { ...line, qty }])
  }

  const total = ordered.reduce((s, i) => s + qtyOf(i.sku), 0)
  const full = ordered.reduce((s, i) => s + i.qty, 0)
  const isWhole = total === full

  return (
    <div className="space-y-1 border-t pt-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Agreed to send
        </p>
        <span className={`text-xs ${isWhole ? 'text-muted-foreground' : 'text-amber-600'}`}>
          {isWhole ? 'the whole order' : `part shipment · ${total} of ${full}`}
        </span>
        {!isWhole && (
          <Button
            size="sm"
            variant="outline"
            className="h-5 text-[11px] px-1.5 ml-auto"
            onClick={() => write(ordered)}
          >
            Whole order
          </Button>
        )}
      </div>

      {ordered.map(i => (
        <div key={i.sku} className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-xs">{i.name}</span>
          <Input
            type="number"
            min="0"
            max={i.qty}
            className="h-6 w-16 text-xs text-right px-2"
            defaultValue={qtyOf(i.sku)}
            key={`${i.sku}-${qtyOf(i.sku)}`}
            onBlur={e => setQty(i.sku, Number(e.target.value) || 0)}
          />
          <span className="text-xs text-muted-foreground shrink-0 w-16">
            of {i.qty}
          </span>
        </div>
      ))}
    </div>
  )
}
