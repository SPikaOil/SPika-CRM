'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Truck, Plus, Printer, Trash2, CheckCircle2, Clock, Loader2, UserCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { useAssignableUsers } from '@/hooks/use-assignable-users'
import { openPackingSlip } from '@/lib/packing-slip'
import { isPosLine } from '@/lib/pos'
import {
  useDeliveryRuns, usePrepareDeliveryRun, useCancelDeliveryRun, useUpdateDeliveryRun,
  openPerSkuFor,
  type DeliveryRun,
} from '@/hooks/use-delivery-runs'
import type { Order, QuoteItem } from '@/types'

/**
 * The runs an order goes out on.
 *
 * Danique, 2026-08-20: "er zou hier een tussenstap moeten zijn waar je de
 * deellevering klaarzet en iemand assigned." Before this the run only existed
 * at the moment somebody signed for it — so there was nothing to hand to a
 * driver, nothing on their agenda, and nothing to print a packing slip from.
 *
 * A run is prepared here: what goes out, who takes it, which day. It then shows
 * up on that person's dashboard, and the packing slip prints THIS run — 43
 * bottles, not the 130 the order says.
 *
 * Signing happens on the delivery screen and nowhere else. What was delivered
 * is a document, and a document is not edited afterwards; a mistake is a second
 * run, not a correction of the first.
 */
const NOBODY = '__nobody__'

function fmtDay(value?: string | null) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function DeliveryRunsCard({ order }: { order: Order }) {
  const { profile, isAdmin, can } = useAuth()
  const canPrepare = isAdmin || can('orders.view')

  const { data: runs } = useDeliveryRuns(order.id)
  // The full team is for READING a name back. The choices below follow the
  // rule: active, and ticked at this order's place.
  const { data: users } = useUsers()
  const { data: assignable } = useAssignableUsers(order.id)
  const prepare = usePrepareDeliveryRun()
  const cancel = useCancelDeliveryRun()
  const updateRun = useUpdateDeliveryRun()

  const [adding, setAdding] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [assignee, setAssignee] = useState<string>(NOBODY)
  const [day, setDay] = useState('')
  const [printing, setPrinting] = useState<string | null>(null)

  const list = runs ?? []
  const orderItems = ((order.items ?? []) as QuoteItem[]).filter(i => i.qty > 0)
  // What is still to go out, counting runs already prepared as well as driven —
  // otherwise a second run carries bottles the first one is already taking.
  const open = openPerSkuFor(orderItems, list)
  const totalOpen = Array.from(open.values()).reduce((s, n) => s + n, 0)

  function startAdding() {
    // Everything still open, as the starting point. Cut it down for a part run.
    const next: Record<string, string> = {}
    for (const i of orderItems) next[i.sku] = String(open.get(i.sku) ?? 0)
    setQty(next)
    setAssignee(order.assigned_to ?? NOBODY)
    setDay(order.planned_date ?? '')
    setAdding(true)
  }

  function submit() {
    const items = orderItems
      .map(i => ({ ...i, qty: Math.min(Number(qty[i.sku] ?? 0) || 0, open.get(i.sku) ?? 0) }))
      .filter(i => i.qty > 0)

    prepare.mutate(
      {
        orderId: order.id,
        items,
        assignedTo: assignee === NOBODY ? null : assignee,
        plannedDate: day || null,
        preparedBy: profile?.id ?? null,
      },
      { onSuccess: () => { setAdding(false); setQty({}) } },
    )
  }

  /** The packing slip of ONE run — see lib/packing-slip.ts. */
  async function printRun(run: DeliveryRun) {
    setPrinting(run.id)
    const result = await openPackingSlip(order, run.items ?? [])
    if (!result.ok) toast.error(result.error)
    setPrinting(null)
  }

  const nameOf = (id: string | null) =>
    id ? ((users ?? []).find(u => u.id === id)?.name ?? 'Someone') : null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Delivery runs
          <span className={`ml-auto text-xs font-normal ${totalOpen > 0 ? 'text-amber-600' : 'text-green-700'}`}>
            {totalOpen > 0 ? `${totalOpen} still to go out` : 'everything is on a run'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground">
            No runs yet. Prepare one and it appears on the driver&apos;s dashboard,
            with a packing slip for exactly what is in the box.
          </p>
        )}

        {list.map(run => {
          const done = !!run.delivered_at
          const lines = (run.items ?? []).filter(i => !isPosLine(i))
          const count = lines.reduce((s, i) => s + i.qty, 0)
          return (
            <div key={run.id} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {done ? (
                  <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Delivered {fmtDay(run.delivered_at)}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                    <Clock className="h-3 w-3" />
                    Prepared
                  </Badge>
                )}

                {/* The day, changeable on the spot. Same reason as the name
                    beside it: a run that moves to Thursday should not need you
                    to open a second screen to say so. */}
                {!done && canPrepare ? (
                  <Input
                    type="date"
                    className={`h-6 w-36 text-xs px-2 ${run.planned_date ? '' : 'border-amber-400'}`}
                    defaultValue={run.planned_date ?? ''}
                    onBlur={e => {
                      const next = e.target.value || null
                      if (next === (run.planned_date ?? null)) return
                      updateRun.mutate({
                        id: run.id, orderId: order.id, values: { planned_date: next },
                      })
                    }}
                  />
                ) : run.planned_date && !done ? (
                  <span className="text-xs text-muted-foreground">{fmtDay(run.planned_date)}</span>
                ) : null}
                <span className="text-sm font-medium">{count} bottles</span>

                {/* WHO has it — and while the run is still prepared, who has it
                    is CHANGEABLE right here.
                    Her point of 2026-08-20: it was a grey word beside the count
                    you had to know to look for, and picking somebody else on
                    the delivery screen did not stick, because that field is only
                    written when the run is signed off. Somebody calls in sick
                    hours before the run — that is the moment you need this, and
                    it saves the instant you pick.
                    A delivered run keeps a plain badge: what happened, happened. */}
                {done ? (
                  run.assigned_to && (
                    <Badge className="bg-blue-100 text-blue-700 text-xs gap-1">
                      <UserCircle2 className="h-3 w-3" />
                      {nameOf(run.assigned_to)}
                    </Badge>
                  )
                ) : canPrepare ? (
                  <Select
                    value={run.assigned_to ?? NOBODY}
                    onValueChange={v => v && updateRun.mutate({
                      id: run.id,
                      orderId: order.id,
                      values: { assigned_to: v === NOBODY ? null : v },
                    })}
                  >
                    <SelectTrigger
                      className={`h-6 text-xs px-2 w-auto min-w-[130px] ${
                        run.assigned_to ? '' : 'border-amber-400 text-amber-700'
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOBODY}>Nobody assigned</SelectItem>
                      {assignable.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`text-xs gap-1 ${
                    run.assigned_to ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'
                  }`}>
                    <UserCircle2 className="h-3 w-3" />
                    {nameOf(run.assigned_to) ?? 'Nobody assigned'}
                  </Badge>
                )}
              </div>

              <div className="space-y-0.5">
                {(run.items ?? []).map(i => (
                  <p key={i.sku} className="text-xs text-muted-foreground">
                    {i.qty}× {i.name}
                  </p>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                  onClick={() => printRun(run)} disabled={printing === run.id}
                >
                  {printing === run.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Printer className="h-3 w-3" />}
                  Packing slip
                </Button>

                {!done && (
                  <>
                    <Link href={`/delivery/${order.id}`}>
                      <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700">
                        Hand it over →
                      </Button>
                    </Link>
                    {canPrepare && (
                      <button
                        onClick={() => {
                          if (!confirm('Cancel this run? Nothing has gone out yet.')) return
                          cancel.mutate({ id: run.id, orderId: order.id })
                        }}
                        className="text-muted-foreground hover:text-red-600 ml-auto"
                        title="Cancel this run"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}

        {canPrepare && !adding && totalOpen > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={startAdding}>
            <Plus className="h-3 w-3" />
            Prepare a run
          </Button>
        )}

        {adding && (
          <div className="rounded-lg border p-2.5 space-y-2">
            <p className="text-sm font-medium">What goes out on this run?</p>

            {orderItems.map(i => {
              const stillOpen = open.get(i.sku) ?? 0
              return (
                <div key={i.sku} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-xs">{i.name}</span>
                  <Input
                    type="number" min="0" max={stillOpen}
                    className="h-7 w-16 text-xs text-right px-2"
                    value={qty[i.sku] ?? ''}
                    onChange={e => setQty(q => ({ ...q, [i.sku]: e.target.value }))}
                    disabled={stillOpen === 0}
                  />
                  <span className="text-xs text-muted-foreground w-16 shrink-0">
                    of {stillOpen} left
                  </span>
                </div>
              )
            })}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Who takes it</Label>
                <Select value={assignee} onValueChange={v => v && setAssignee(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOBODY}>Nobody yet</SelectItem>
                    {assignable.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Which day</Label>
                <Input
                  type="date" className="h-8 text-xs"
                  value={day} onChange={e => setDay(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700"
                disabled={prepare.isPending} onClick={submit}
              >
                {prepare.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Prepare
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
