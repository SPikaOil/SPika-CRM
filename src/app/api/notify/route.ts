import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail, ADMIN_EMAIL,
  emailOrderPlaced, emailOrderConfirmed, emailOutForDelivery,
  emailOrderDelivered, emailInvoiceReady, emailOBFormSigned,
  emailNewCustomer, emailTaskAssigned,
} from '@/lib/resend'

export async function POST(req: NextRequest) {
  // Must be authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, payload } = await req.json()
  const admin = createAdminClient()

  try {
    switch (type) {
      // ── Admin: new order placed via portal ─────────────────────
      case 'order_placed': {
        const { orderNumber, customerName, total, items } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `New order: #${orderNumber} — ${customerName}`,
          html: emailOrderPlaced({ orderNumber, customerName, total, items }),
        })
        break
      }

      // ── Customer: order confirmed (approved by admin) ──────────
      case 'order_confirmed': {
        const { orderNumber, customerEmail, customerName, plannedDate, billingEmails } = payload
        const recipients = [customerEmail, ...(billingEmails ?? [])].filter(Boolean)
        if (recipients.length > 0) {
          await sendEmail({
            to: recipients,
            subject: `Your order #${orderNumber} is confirmed!`,
            html: emailOrderConfirmed({ orderNumber, customerName, plannedDate }),
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

      // ── Admin + Customer: order delivered ──────────────────────
      case 'order_delivered': {
        const { orderNumber, customerName, customerEmail, billingEmails } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `Order #${orderNumber} delivered — ${customerName}`,
          html: emailOrderDelivered({ orderNumber, customerName, isAdmin: true }),
        })
        const recipients = [customerEmail, ...(billingEmails ?? [])].filter(Boolean)
        if (recipients.length > 0) {
          await sendEmail({
            to: recipients,
            subject: `Your order #${orderNumber} has been delivered!`,
            html: emailOrderDelivered({ orderNumber, customerName, isAdmin: false }),
          })
        }
        break
      }

      // ── Customer: invoice ready ────────────────────────────────
      case 'invoice_ready': {
        const { orderNumber, customerName, customerEmail, billingEmails, total } = payload
        const recipients = [customerEmail, ...(billingEmails ?? [])].filter(Boolean)
        if (recipients.length > 0) {
          await sendEmail({
            to: recipients,
            subject: `Invoice ready: #${orderNumber}`,
            html: emailInvoiceReady({ orderNumber, customerName, total }),
          })
        }
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

      default:
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
