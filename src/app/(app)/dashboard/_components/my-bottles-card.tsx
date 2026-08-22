'use client'

import { useState } from 'react'
import { Briefcase, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useBatchStock } from '@/hooks/use-batches'
import { useAuth } from '@/contexts/auth-context'
import { formatTht } from '@/lib/utils'

/**
 * What YOU are still carrying.
 *
 * Danique, 2026-08-21: "als ik aan djamy op 21 aug 50 flessen geef en hij begint
 * met orders te leveren, dat de app bijhoudt hoeveel flessen hij nog over
 * heeft... dit zou bij teamlid op zn dashboard komen te staan."
 *
 * The number is the sum of his movements, exactly like a warehouse shelf — the
 * fifty he signed for, less every order he has delivered out of them. Nothing is
 * stored as a total, so it cannot drift away from what really happened.
 *
 * It shows only when there is something to show. Somebody who never takes
 * bottles with them should not carry an empty card around forever.
 */
export function MyBottlesCard() {
  const { profile } = useAuth()
  const { data: stock } = useBatchStock()
  const [open, setOpen] = useState(false)

  const mine = (stock ?? []).filter(r => r.holder_id === profile?.id && r.qty > 0)
  if (mine.length === 0) return null

  const total = mine.reduce((s, r) => s + r.qty, 0)

  // Per product, because "how many 50ml do I still have" is the question in the
  // car. The batch behind it is one tap away for whoever needs it.
  const perProduct = new Map<string, number>()
  for (const r of mine) perProduct.set(r.product_name, (perProduct.get(r.product_name) ?? 0) + r.qty)

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-blue-100/40 dark:hover:bg-blue-900/20 transition-colors"
      >
        <Briefcase className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            {total} {total === 1 ? 'bottle' : 'bottles'} still with you
          </p>
          <p className="text-xs text-blue-600/80 dark:text-blue-500">
            {Array.from(perProduct.entries()).map(([name, qty]) => `${qty}× ${name}`).join(' · ')}
          </p>
        </div>
        <Badge className="bg-blue-600 text-white text-sm px-2 shrink-0">{mine.length}</Badge>
        {open
          ? <ChevronUp className="h-4 w-4 text-blue-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-blue-500 shrink-0" />}
      </button>

      {open && (
        <div className="divide-y divide-blue-100 dark:divide-blue-900 border-t border-blue-200 dark:border-blue-800">
          {mine.map(r => (
            <div key={`${r.batch_id}-${r.sku}`} className="flex items-center gap-2 px-3 py-1 text-sm leading-tight">
              <span className="flex-1 min-w-0 truncate">{r.product_name}</span>
              <span className="font-mono text-xs text-muted-foreground shrink-0">{r.batch_number}</span>
              {r.tht_date && (
                <span className="text-xs text-muted-foreground shrink-0">THT {formatTht(r.tht_date)}</span>
              )}
              <span className="font-medium shrink-0 w-10 text-right">{r.qty}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
