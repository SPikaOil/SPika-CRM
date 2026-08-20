import { createClient } from '@/lib/supabase/client'
import type { Order, QuoteItem } from '@/types'

/**
 * The packing slip of ONE run — the paper that travels in the box.
 *
 * Danique, 2026-08-20: a packing slip goes WITH the goods, so it has to be
 * printable before anybody drives, and by whoever is doing the driving. It lived
 * on the order page only, which is not where a warehouse member stands: they
 * come off their dashboard straight into the delivery screen and there was
 * nothing there at all.
 *
 * It prints THIS run. The order says 130 and the box holds 43, and the customer
 * gets a slip that agrees with what they are unpacking.
 *
 * NO PRICES. A packing slip says what is in the box; what it cost is on the
 * invoice, and the person carrying the box has no business with it.
 *
 * The tab opens AFTER the blob is ready, never before — a blank tab filled in
 * later freezes iOS Safari, which is the phone this runs on.
 */
export async function openPackingSlip(
  order: Order,
  items: QuoteItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (items.length === 0) {
      return { ok: false, error: 'Nothing on this run yet' }
    }

    const supabase = createClient()
    const React = await import('react')
    const { pdf } = await import('@react-pdf/renderer')
    const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')
    const { fetchOrderBatches } = await import('@/lib/order-batches')

    const { data: company } = await supabase
      .from('company_settings').select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001').single()

    const blob = await (pdf as never as (el: unknown) => { toBlob: () => Promise<Blob> })(
      React.createElement(DeliveryNotePDF as never, {
        order: { ...order, items },
        batches: await fetchOrderBatches(order.id),
        showPrices: false,
        company: company ?? undefined,
        documentType: 'PACKING SLIP',
      } as never),
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    // Long enough for the tab to have loaded it, short enough not to hold the
    // blob for the rest of the session.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not build the packing slip',
    }
  }
}
