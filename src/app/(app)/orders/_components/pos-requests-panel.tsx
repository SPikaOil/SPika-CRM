'use client'

import { useState } from 'react'
import { PackagePlus, Check, Ban, Loader2 } from 'lucide-react'
import { usePosRequests, useGrantPosRequest, useDeclinePosRequest } from '@/hooks/use-pos-requests'
import { POS_STATUS_LABELS, POS_STATUS_TONES, PosStatus } from '@/lib/marketing'
import { PosRequest, QuoteItem } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Open POS requests for the customer this order belongs to.
 *
 * Shown on the ORDER page on purpose: a request is raised long before there is
 * an order to put it on, so the moment it can actually be granted is the moment
 * someone is preparing the next delivery. A list on its own screen would be a
 * list nobody opens.
 */
export function PosRequestsPanel({
  customerId,
  orderId,
  items,
  canGrant,
}: {
  customerId: string
  orderId: string
  items: QuoteItem[]
  canGrant: boolean
}) {
  const { data: requests, isLoading } = usePosRequests({ customerId })
  const grant = useGrantPosRequest()
  const decline = useDeclinePosRequest()
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const open = (requests ?? []).filter(r => r.status === 'open')
  const onThisOrder = (requests ?? []).filter(r => r.order_id === orderId && r.status !== 'open')

  // Nothing to do and nothing to show — stay out of the way.
  if (isLoading || (open.length === 0 && onThisOrder.length === 0)) return null

  return (
    <Card size="sm" className="py-0 border-orange-200 dark:border-orange-900">
      <CardHeader className="pt-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-orange-600" />
          POS material requested
          {open.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              {open.length} open
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-3 space-y-2">
        {open.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            Free for resellers. Adding it puts a €0 line on this order, so the shop
            has it on paper.
          </p>
        )}

        {[...open, ...onThisOrder].map(req => (
          <div key={req.id} className="rounded-lg border px-2.5 py-2 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {req.qty}× {req.asset?.title ?? 'POS material'}
                </p>
                {req.note && (
                  <p className="text-[11px] text-muted-foreground leading-snug">{req.note}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Asked {new Date(req.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0 rounded font-medium shrink-0 ${POS_STATUS_TONES[req.status as PosStatus]}`}>
                {POS_STATUS_LABELS[req.status as PosStatus]}
              </span>
            </div>

            {req.status === 'declined' && req.decline_reason && (
              <p className="text-[11px] text-muted-foreground">Reason: {req.decline_reason}</p>
            )}

            {canGrant && req.status === 'open' && (
              decliningId === req.id ? (
                <div className="flex gap-1.5">
                  <Input
                    className="h-7 text-xs"
                    autoFocus
                    placeholder="Why not? The reseller sees this."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={reason.trim().length < 3 || decline.isPending}
                    onClick={() => decline.mutate(
                      { id: req.id, reason: reason.trim() },
                      { onSuccess: () => { setDecliningId(null); setReason('') } }
                    )}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                    onClick={() => { setDecliningId(null); setReason('') }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1 bg-red-600 hover:bg-red-700"
                    disabled={grant.isPending}
                    onClick={() => grant.mutate({ request: req as PosRequest, orderId, currentItems: items })}
                  >
                    {grant.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Send with this order
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => setDecliningId(req.id)}>
                    <Ban className="h-3 w-3" />
                    Decline
                  </Button>
                </div>
              )
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
