'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useTransportLocations } from '@/hooks/use-transports'
import { useWarehousesFor } from '@/hooks/use-customer-warehouses'
import { useBatchStock } from '@/hooks/use-batches'
import { atPlace } from '@/lib/stock-place'

/** Curaçao is NULL everywhere in this app; a Select item cannot carry an empty value. */
const CURACAO = '__curacao__'

/**
 * Where this order goes out from.
 *
 * Only the warehouses ticked on the customer — her rule of 2026-08-21, and the
 * reason those ticks exist at all. And with what is standing at each of them
 * for the products on THIS order, because the whole point was seeing it before
 * you commit: "stel dat ik een order dan invoer en ik zet hem op NBC, dan moet
 * ik wel zien of NBC dan voorraad heeft, want anders kan ik meteen een andere
 * warehouse kiezen."
 *
 * One component, used when an order is written and again when it is approved.
 * Two copies of a picker like this drift, and then the list you choose from is
 * not the list the delivery reads.
 */
export function WarehousePicker({
  customerId,
  items,
  value,
  onChange,
  label = 'Delivered from',
  disabled,
}: {
  customerId: string | null | undefined
  /** The products on this order, to say what each warehouse can cover. */
  items: { sku: string; qty: number }[]
  /** The chosen warehouse. NULL means Curaçao — but see `value === undefined`. */
  value: string | null
  onChange: (locationId: string | null) => void
  label?: string
  disabled?: boolean
}) {
  const { data: locations } = useTransportLocations()
  const { data: ticked } = useWarehousesFor(customerId)
  const { data: stock } = useBatchStock()

  const options = ticked.map(id => ({
    id,
    name: id === null ? 'Curaçao' : (locations ?? []).find(l => l.id === id)?.name ?? 'Warehouse',
  }))

  /**
   * What this place cannot cover of this order.
   *
   * The place's own stock only — bottles a colleague is carrying are not on
   * that shelf (migration 112). Named per product, because "short" without
   * saying on what is not something you can act on.
   */
  function shortAt(locationId: string | null): string[] {
    const gaps: string[] = []
    for (const item of items) {
      if (item.qty <= 0) continue
      const have = (stock ?? [])
        .filter(r => r.sku === item.sku && atPlace(r, locationId) && r.qty > 0)
        .reduce((s, r) => s + r.qty, 0)
      if (have < item.qty) gaps.push(`${item.qty - have}× ${item.sku}`)
    }
    return gaps
  }

  if (options.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-red-600">
          This customer is not linked to a warehouse yet. Set it on the customer
          card under &ldquo;Delivered from&rdquo;.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Select
        value={value === null ? CURACAO : value}
        disabled={disabled}
        onValueChange={v => v && onChange(v === CURACAO ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Pick a warehouse">
            {(v: string) => options.find(o => (o.id ?? CURACAO) === v)?.name ?? 'Pick a warehouse'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => {
            const gaps = shortAt(o.id)
            return (
              <SelectItem key={o.id ?? CURACAO} value={o.id ?? CURACAO} label={o.name}>
                {o.name}
                <span className={gaps.length > 0 ? 'text-red-600' : 'text-muted-foreground'}>
                  {' '}· {gaps.length === 0 ? 'covered' : `short ${gaps.join(', ')}`}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {/* Said again outside the list, because a dropdown closes and the warning
          would close with it. Never a block: a run can be prepared before the
          stock lands, and she has been clear that a warning must not stop work. */}
      {shortAt(value).length > 0 && (
        <p className="text-xs text-amber-600">
          Not everything is standing there: short {shortAt(value).join(', ')}
        </p>
      )}
    </div>
  )
}
