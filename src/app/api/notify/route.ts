import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail, ADMIN_EMAIL, FROM,
  emailOrderPlaced, emailOrderReceived, emailOutForDelivery,
  emailOrderDelivered, emailOBFormSigned,
  emailNewCustomer, emailTaskAssigned, emailTaskCompleted,
  emailHandoverReceipt, emailPosRequest,
} from '@/lib/resend'
import { portalRecipients } from '@/lib/portal-recipients'

export async function POST(req: NextRequest) {
  // Must be authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, payload } = await req.json()
  const admin = createAdminClient()

  // ── A customer may only announce what a customer can actually do ───────────
  //
  // Being signed in was the whole check here, and a portal login is signed in.
  // Any customer could therefore post any type — "task_assigned",
  // "handover_receipt", "new_customer" — and set off internal mail to our own
  // inbox with a payload of their choosing.
  //
  // Three of the nine types are genuinely theirs, each fired by their own
  // screen: placing an order (portal/new-order), signing the OB form
  // (portal/ob-sign) and asking for POS material (portal/marketing via
  // use-pos-requests). The other six belong to the team.
  const { data: caller } = await admin
    .from('users').select('role, customer_id').eq('id', user.id).single()
  const isCustomer = caller?.role === 'customer' || !!caller?.customer_id

  if (isCustomer) {
    const CUSTOMER_MAY_SEND = new Set(['order_placed', 'ob_form_signed', 'pos_request'])
    if (!CUSTOMER_MAY_SEND.has(type)) {
      console.warn(`[notify] refused "${type}" — a portal account cannot send this`)
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    // order_placed mails the customer as well, and it reads WHICH customer from
    // the payload. Taken from the login instead, so a portal account cannot
    // name someone else's company and have the acknowledgement land there.
    if (payload && typeof payload === 'object') payload.customerId = caller?.customer_id
  }

  // ── Nothing reaches a customer unless the customer asked for it ────────────
  //
  // Danique, 2026-08-14, after mail went out that should not have:
  //   "de info in onze klantaanmaak in de app is voor ons intern gebruik!!!!
  //    dus enkel als een klant via de portal gaat bestellen, dan pas kan hij
  //    update mails krijgen van zn orders."
  //
  // The e-mail addresses on a customer card are OURS. They are there so we can
  // look them up, not so the app can write to them. An address only becomes a
  // mailbox we may use when that customer has a portal login and places orders
  // through it themselves.
  //
  // This is a wall in the SERVER, not a condition at each button. Four screens
  // used to mail customers directly, and the next screen somebody adds would
  // have made it five. Refusing here means it cannot happen from anywhere.
  const CUSTOMER_FACING = new Set([
    'order_confirmed',   // approving an order is an internal act
    'invoice_ready',     // "Send Invoice" is internal — the PDF goes by hand
    'quote_sent',        // a quotation is internal too
  ])
  if (CUSTOMER_FACING.has(type)) {
    console.warn(`[notify] refused "${type}" — internal action, customers are never mailed from the CRM`)
    return NextResponse.json({ ok: false, refused: 'internal_only' })
  }

  try {
    switch (type) {
      // ── Admin: new order placed via portal ─────────────────────
      case 'order_placed': {
        const { customerName, customerId, total, items } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `New order request — ${customerName}`,
          html: emailOrderPlaced({ customerName, total, items }),
        })
        // Acknowledge to the customer as well, so they are not left guessing
        // until an admin gets round to approving.
        //
        // The address comes from their PORTAL LOGIN and nowhere else — never
        // from customers.email, never from a payload. See portal-recipients.ts.
        const placedRecipients = await portalRecipients(customerId)
        if (placedRecipients.length > 0) {
          await sendEmail({
            to: placedRecipients,
            subject: 'We received your order',
            html: emailOrderReceived({ customerName, total, items }),
          })
        }
        break
      }

      // ── Sales: new order assigned for delivery ─────────────────
      case 'order_out_for_delivery': {
        const { orderNumber, customerName, assignedTo } = payload
        if (assignedTo) {
          const { data: worker } = await admin.from('users').select('name, email').eq('id', assignedTo).single()
          if (worker?.email) {
            await sendEmail({
              to: worker.email,
              subject: `New delivery: #${orderNumber}`,
              html: emailOutForDelivery({ orderNumber, customerName, workerName: worker.name }),
            })
          }
        }
        break
      }

      // ── Sales: signed for receipt of bottles (Handover Btls) ───
      case 'handover_receipt': {
        const { memberId, batchNumber, handoverDate, items, signedAt, notes } = payload
        const { data: member } = await admin.from('users').select('name, email').eq('id', memberId).single()
        if (member?.email) {
          await sendEmail({
            to: member.email,
            subject: batchNumber
              ? `Handover confirmed — batch ${batchNumber}`
              : 'Handover confirmed — bottles received for delivery',
            html: emailHandoverReceipt({ memberName: member.name, batchNumber, handoverDate, items, signedAt, notes }),
          })
        }
        break
      }

      // ── Admin only: order delivered ────────────────────────────
      // The customer half is gone on purpose. Somebody who just signed for a
      // delivery does not need an e-mail telling them it was delivered, and the
      // address on their card is ours for internal use.
      case 'order_delivered': {
        const { orderNumber, customerName } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `Order #${orderNumber} delivered — ${customerName}`,
          html: emailOrderDelivered({ orderNumber, customerName, isAdmin: true }),
        })
        break
      }

      // ── Admin: OB form signed ──────────────────────────────────
      case 'ob_form_signed': {
        const { customerName, signerName } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `OB form signed — ${customerName}`,
          html: emailOBFormSigned({ customerName, signerName }),
        })
        break
      }

      // ── Admin: reseller asked for physical POS material ────────
      //
      // Awaited like every other send here: on Vercel the function is frozen
      // the moment the response returns, so a fire-and-forget send is cut off
      // mid-flight and nobody is told.
      case 'pos_request': {
        const { customerName, assetTitle, qty, note, outOfStock } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `POS material requested by ${customerName}`,
          html: emailPosRequest({
            customerName,
            assetTitle,
            qty: String(qty),
            note: note ?? '',
            outOfStock: outOfStock ? 'yes' : 'no',
          }),
        })
        break
      }

      // ── Admin: new customer added ──────────────────────────────
      case 'new_customer': {
        const { customerName, email, category } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `New customer added: ${customerName}`,
          html: emailNewCustomer({ customerName, email, category }),
        })
        break
      }

      // ── Sales: task assigned ───────────────────────────────────
      case 'task_assigned': {
        const { taskTitle, assignedTo, customerName, dueDate } = payload
        if (assignedTo) {
          const { data: worker } = await admin.from('users').select('name, email').eq('id', assignedTo).single()
          if (worker?.email) {
            await sendEmail({
              to: worker.email,
              subject: `New task: ${taskTitle}`,
              html: emailTaskAssigned({ workerName: worker.name, taskTitle, customerName, dueDate }),
            })
          }
        }
        break
      }

      // ── Admin: task completed ──────────────────────────────────
      case 'task_completed': {
        const { taskTitle, completedBy, customerName } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `Task completed: ${taskTitle}`,
          html: emailTaskCompleted({ taskTitle, completedBy, customerName }),
        })
        break
      }

      default:
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/notify — health check. Answers "is email actually configured?"
// without sending anything, so the Emails screen can warn instead of leaving
// you to discover months later that nothing ever went out.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const configured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
  return NextResponse.json({
    configured,
    host: process.env.SMTP_HOST ?? 'smtp.strato.nl',
    from: FROM,
    adminEmail: ADMIN_EMAIL,
  })
}
