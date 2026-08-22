'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBatches, useBatchStock } from '@/hooks/use-batches'
import { atPlace } from '@/lib/stock-place'
import { formatTht } from '@/lib/utils'

const NONE = '__none__'

/**
 * Pick a batch — never type one.
 *
 * Danique's rule, 2026-08-14: a batch number is typed in exactly one place, when
 * the batch is created at Stock. Everywhere else — a handover, a product on an
 * order — you choose from the batches that actually exist. Typing it again is
 * how you end up with SPGE22, SPGE-22 and Spge22 all meaning the same bottles.
 *
 * What is left of a batch is read from `batch_stock`, which is the sum of the
 * movements, so the number next to a batch is what is really on the shelf on
 * Curaçao. A batch with nothing left is still listed, greyed out and marked
 * "empty", because hiding it makes it look like it never existed.
 */
export function BatchSelect({
  sku,
  value,
  onChange,
  /** How many bottles are needed. Only used to warn, never to block. */
  needed,
  disabled,
  className,
  placeholder = 'Choose batch',
  locationId = null,
  holderId = null,
}: {
  sku?: string
  value: string | null | undefined
  onChange: (batchId: string | null) => void
  needed?: number
  disabled?: boolean
  className?: string
  placeholder?: string
  /** Where the bottles are taken from. Null = Curaçao, the default. */
  locationId?: string | null
  /**
   * Whose hands they come out of, when somebody hands back what they carry.
   * Null = off a shelf (migration 112).
   */
  holderId?: string | null
}) {
  const { data: batches } = useBatches()
  const { data: stock } = useBatchStock()

  /**
   * What is left of this batch AT THE PLACE it is being taken from — of one sku,
   * or of all. A batch can be empty on Curaçao and still have 200 bottles
   * sitting in a warehouse, so counting them together would be a lie.
   */
  function left(batchId: string): number {
    return (stock ?? [])
      .filter(r => r.batch_id === batchId
        && (holderId ? r.holder_id === holderId : atPlace(r, locationId))
        && (!sku || r.sku === sku))
      .reduce((sum, r) => sum + r.qty, 0)
  }

  /**
   * Only batches that live HERE and hold THIS product.
   *
   * Both follow from rules set on 2026-08-21. A batch is one product (migration
   * 108), so offering a 100ml batch for a 50ml line is offering a mistake. And
   * a goods receipt makes a batch of its own at the warehouse (migration 110),
   * so a production batch on Curaçao has nothing to do with a pick in
   * Rotterdam — before this it would have been listed there with nought left.
   */
  const options = (batches ?? [])
    .filter(b => holderId
      ? b.holder_id === holderId
      : (b.location_id ?? null) === locationId && !b.holder_id)
    .filter(b => !sku || b.sku === sku)
    .map(b => ({ ...b, left: left(b.id) }))
  const short = value ? options.find(o => o.id === value) : undefined
  const isShort = short && needed !== undefined && short.left < 0

  return (
    <div className={className}>
      <Select
        // null, not undefined: no selection, but still a CONTROLLED select.
        // Handing it the sentinel printed the literal "__none__" in the field,
        // and handing it undefined made it flip to uncontrolled the moment a
        // batch was chosen.
        value={value ?? null}
        disabled={disabled}
        onValueChange={v => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className={`h-7 w-full text-xs px-2 ${!value ? 'border-red-300' : ''}`}>
          {/* Without this the trigger prints the raw value — a bare uuid, in a
              field that is supposed to say SPGE22. */}
          <SelectValue placeholder={placeholder}>
            {(v: string) => options.find(o => o.id === v)?.batch_number ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— no batch —</SelectItem>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>
              <span className="font-mono">{o.batch_number}</span>
              {o.tht_date ? <span className="text-muted-foreground"> · THT {formatTht(o.tht_date)}</span> : null}
              <span className={o.left <= 0 ? 'text-red-600' : 'text-muted-foreground'}>
                {' '}· {o.left <= 0 ? 'empty' : `${o.left} left`}
              </span>
            </SelectItem>
          ))}
          {options.length === 0 && (
            <SelectItem value="__empty__" disabled>
              No batches yet — create one under Stock
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {/* A batch that has gone negative was over-picked: more bottles were taken
          off it than were ever filled into it. That is a counting error
          somewhere, and it should be visible the moment it happens. */}
      {isShort && (
        <p className="text-xs text-red-600 mt-0.5">
          Over-picked by {Math.abs(short!.left)} — this batch does not hold that many
        </p>
      )}
    </div>
  )
}
