'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { Timer, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { transportColli } from '@/lib/transport-cargo'
import { Transport } from '@/types'

/**
 * How the transports have actually done.
 *
 * Danique, 2026-08-20: "ETD, ATA, vervoerder en duration transport moeten we
 * ergens overzichtelijk kunnen zien. Nu is er weinig data, maar in 1 oogopslag
 * zien hoe de transporten hebben gedaan."
 *
 * The point is the gap between what was promised and what happened, so ETA and
 * ATA sit next to each other and the difference is spelled out rather than left
 * to be worked out. Per COLLI, because that is how they arrive: her three boxes
 * came in after 20 days, 23 days and never.
 *
 * A load still out shows how long it HAS been out, not a blank. That is the
 * number you act on — 83 days is a claim, not a delay.
 */
const DAY = 86400000

function fmt(value?: string | null) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en', {
    day: 'numeric', month: 'short', year: '2-digit',
  })
}

function daysBetween(from?: string | null, to?: string | null) {
  if (!from || !to) return null
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00`) - Date.parse(`${from.slice(0, 10)}T12:00:00`)) / DAY)
}

export function TransitOverview({ transports }: { transports: Transport[] }) {
  // One clock for the whole render. Reading it per row would make the render
  // impure and two rows could disagree about what "today" is.
  const [now] = useState(() => Date.now())
  const [open, setOpen] = useState<string | null>(null)

  // Only loads that have actually left. A draft nobody has shipped has nothing
  // to report and would only make the list long.
  const shipped = transports.filter(t => t.etd)
  if (shipped.length === 0) return null

  const daysOut = (etd?: string | null) =>
    etd ? Math.max(0, Math.round((now - Date.parse(`${etd.slice(0, 10)}T12:00:00`)) / DAY)) : null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" />
          Transit
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {shipped.length} shipped
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Wide on a phone, so it scrolls inside its own box instead of pushing
            the page sideways. */}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[620px]">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="font-medium pb-1 pr-2">Transport</th>
                <th className="font-medium pb-1 pr-2">To</th>
                <th className="font-medium pb-1 pr-2">Carrier</th>
                <th className="font-medium pb-1 pr-2">ETD</th>
                <th className="font-medium pb-1 pr-2">ETA</th>
                <th className="font-medium pb-1 pr-2">ATA</th>
                <th className="font-medium pb-1 pr-2 text-right">Days</th>
                <th className="font-medium pb-1 text-right">Colli</th>
              </tr>
            </thead>
            <tbody>
              {shipped.map(t => {
                const colli = transportColli(t)
                const inCount = colli.filter(c => c.ata).length
                const atas = colli.map(c => c.ata).filter(Boolean) as string[]
                const last = atas.length > 0 ? atas.slice().sort().at(-1)! : null
                const allIn = colli.length > 0 && inCount === colli.length
                const days = allIn ? daysBetween(t.etd, last) : daysOut(t.etd)
                const late = t.eta && last ? (daysBetween(t.eta, last) ?? 0) : null
                const isOpen = open === t.id

                return (
                  // The key belongs on the outermost thing this map returns —
                  // a row plus its box rows — not on the first <tr> inside it.
                  <Fragment key={t.id}>
                    <tr className="border-t align-top">
                      <td className="py-1 pr-2">
                        <Link href={`/exports/${t.id}`} className="font-mono font-medium hover:underline">
                          {t.transport_number}
                        </Link>
                      </td>
                      <td className="py-1 pr-2 truncate max-w-[120px]">
                        {t.ship_to === 'warehouse'
                          ? (t.location?.name ?? 'Warehouse')
                          : (t.destination || '—')}
                      </td>
                      <td className="py-1 pr-2 truncate max-w-[120px]">{t.carrier?.name ?? '—'}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{fmt(t.etd) ?? '—'}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{fmt(t.eta) ?? '—'}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {last ? fmt(last) : <span className="text-amber-600">still out</span>}
                      </td>
                      <td className={`py-1 pr-2 text-right font-semibold whitespace-nowrap ${
                        allIn ? '' : 'text-amber-600'
                      }`}>
                        {days === null ? '—' : `${days}`}
                        {/* Against the promise. Only shown once something landed,
                            because "3 days late" needs a day it landed on. */}
                        {late !== null && (
                          <span className={`ml-1 font-normal ${late > 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {late > 0 ? `+${late}` : late < 0 ? `${late}` : 'on time'}
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {colli.length === 0 ? '—' : (
                          <button
                            onClick={() => setOpen(isOpen ? null : t.id)}
                            className="inline-flex items-center gap-0.5 hover:underline"
                          >
                            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className={allIn ? 'text-green-700' : 'text-amber-600'}>
                              {inCount}/{colli.length}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Per box, because that is how they arrive. */}
                    {isOpen && colli.map((c, i) => {
                      const boxDays = c.ata ? daysBetween(t.etd, c.ata) : daysOut(t.etd)
                      return (
                        <tr key={`${t.id}-${i}`} className="text-muted-foreground">
                          <td className="py-0.5 pr-2 pl-3">Colli {i + 1}</td>
                          <td className="py-0.5 pr-2 truncate max-w-[200px]" colSpan={4}>
                            {c.items.map(it => `${it.qty}× ${it.name}`).join(', ') || 'Empty'}
                          </td>
                          <td className="py-0.5 pr-2 whitespace-nowrap">
                            {c.ata ? fmt(c.ata) : <span className="text-amber-600">still out</span>}
                          </td>
                          <td className={`py-0.5 pr-2 text-right whitespace-nowrap ${c.ata ? '' : 'text-amber-600'}`}>
                            {boxDays === null ? '—' : `${boxDays} days`}
                          </td>
                          <td className="py-0.5 text-right">
                            {c.ata_note ? (
                              <span className="text-[11px]">{c.ata_note}</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          Days is ETD to the last box in, or how long it has been out while
          something is still missing. The number beside it is against the ETA.
        </p>
      </CardContent>
    </Card>
  )
}
