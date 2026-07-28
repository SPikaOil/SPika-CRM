import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, ADMIN_EMAIL, emailOrderModified, emailOrderModifiedConfirmation } from '@/lib/resend'
import { QuoteItem } from '@/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Load user profile to get customer_id
  const { data: profile } = await admin
    .from('users')
    .select('customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.customer_id) {
    return NextResponse.json({ error: 'No customer profile linked' }, { status: 403 })
  }

  // Load the order
  const { data: order } = await admin
    .from('orders')
    .select('*, customer:customers(*)')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Verify ownership and editable status
  if (order.customer_id !== profile.customer_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const editableStatuses = ['pending_approval', 'processing']
  if (!editableStatuses.includes(order.status)) {
    return NextResponse.json({ error: 'Order cannot be edited in its current status' }, { status: 403 })
  }

  // Parse and validate body
  let body: { items: QuoteItem[]; total: number; delivery_notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { items, total, delivery_notes } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }
  if (typeof total !== 'number') {
    return NextResponse.json({ error: 'total must be a number' }, { status: 400 })
  }

  // Update the order
  const { error: updateError } = await admin
    .from('orders')
    .update({
      items,
      total,
      delivery_notes: delivery_notes ?? order.delivery_notes,
      status: 'pending_approval',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('[edit-order] Update failed:', updateError)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }

  const customer = (order as any).customer
  const customerName = customer?.company_name ?? 'Unknown'
  const orderNumber = order.order_number ?? id
  // The order carries its own currency (051) — the notification must say the
  // same thing the customer saw on screen and will see on the invoice.
  const currency = (order as any).currency ?? customer?.currency ?? 'XCG'
  const itemsText = items.map((i: QuoteItem) => `${i.qty}× ${i.name} (${currency} ${i.line_total.toFixed(2)})`).join('<br>')
  const totalFormatted = `${currency} ${Number(total).toFixed(2)}`

  // Send admin notification (fire-and-forget)
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `Order #${orderNumber} modified — ${customerName}`,
    html: emailOrderModified({
      orderNumber,
      customerName,
      items: itemsText,
      total: totalFormatted,
    }),
  }).catch(err => console.error('[edit-order] Admin email failed:', err))

  // Send customer confirmation if email is available
  const customerEmail = customer?.email
  if (customerEmail) {
    sendEmail({
      to: customerEmail,
      subject: `Your changes to order #${orderNumber} have been received`,
      html: emailOrderModifiedConfirmation({
        orderNumber,
        customerName,
      }),
    }).catch(err => console.error('[edit-order] Customer email failed:', err))
  }

  return NextResponse.json({ ok: true })
}
