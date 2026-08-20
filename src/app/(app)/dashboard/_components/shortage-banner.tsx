'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTransports } from '@/hooks/use-transports'

/**
 * Bottles that never arrived, waiting for somebody to decide what happens next.
 *
 * Danique, 2026-08-20: "we hadden een verschil bij 1 colli inslag, 29 ipv 30
 * geleverd... ergens moet er duidelijk staan dat we 1 tekort hebben, dit zou
 * Curaçao moeten zien om actie te ondernemen."
 *
 * The goods receipt already wrote it down — counted 29, expected 30, with a
 * reason — but it sat inside one transport screen. Nobody goes looking for a
 * bottle they do not know is missing, so the count was honest and invisible at
 * the same time. This is the other half: the office is told, on the screen they
 * open first.
 *
 * It shows only what is UNSETTLED. Once somebody has said credit, deliver later
 * or our own loss, the decision is made and the line drops off — a list that
 * cannot be emptied is a list people stop reading.
 *
 * The two ways out are named because they are not obvious from the number: send
 * the missing bottles on the next transport, or move them from a warehouse that
 * has them.
 */
export function ShortageBanner() {
  const { data: transports } = useTransports()
  const [expanded, setExpanded] = useState(false)

  const open = (transports ?? []).flatMap(t =>
    (t.receipt_lines ?? [])
      .filter(l => l.received < l.expected && !l.outcome)
      .map(l => ({
        transportId: t.id,
        transport: t.transport_number,
        place: t.location?.name ?? 'the warehouse',
        ...l,
      })),
  )

  if (open.length === 0) return null

  const bottles = open.reduce((s, l) => s + (l.expected - l.received), 0)

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-red-100/40 dark:hover:bg-red-900/20 transition-colors"
      >
        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-red-700 dark:text-red-400">
            {bottles} {bottles === 1 ? 'bottle' : 'bottles'} short on arrival
          </p>
          <p className="text-xs text-red-600/80 dark:text-red-500">
            {open.length} {open.length === 1 ? 'line' : 'lines'} still to decide
            <span className="hidden sm:inline"> · send again, or hand over from another warehouse</span>
          </p>
        </div>
        <Badge className="bg-red-600 text-white text-sm px-2 shrink-0">{open.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-red-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-red-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="divide-y divide-red-100 dark:divide-red-900 border-t border-red-200 dark:border-red-800">
          {open.map((l, i) => (
            <Link
              key={`${l.transportId}-${i}`}
              href={`/exports/${l.transportId}`}
              className="flex items-center justify-between px-3 py-1 gap-3 leading-tight hover:bg-red-100/40 dark:hover:bg-red-900/20 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{l.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {l.transport} · {l.place}
                  {l.colli ? ` · Colli ${l.colli}` : ''}
                  {l.order_number ? ` · ${l.order_number}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-red-700 dark:text-red-400">
                  {l.expected - l.received} short
                </p>
                <p className="text-[10px] text-muted-foreground -mt-0.5">
                  counted {l.received} of {l.expected}
                </p>
              </div>
            </Link>
          ))}
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            Open the transport to settle each one: credit the customer, deliver later,
            or carry it ourselves.
          </p>
        </div>
      )}
    </div>
  )
}
