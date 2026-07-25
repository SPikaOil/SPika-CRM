import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail, ADMIN_EMAIL, FROM,
  emailOrderPlaced, emailOrderReceived, emailOrderConfirmed, emailOutForDelivery,
  emailOrderDelivered, emailInvoiceReady, emailOBFormSigned,
  emailNewCustomer, emailTaskAssigned, emailQuoteSent, emailTaskCompleted,
  emailHandoverReceipt,
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
        const { customerName, customerEmail, billingEmails, total, items } = payload
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `New order request — ${customerName}`,
          html: emailOrderPlaced({ customerName, total, items }),
        })
        // Acknowledge to the customer as well, so they are not left guessing
        // until an admin gets round to approving.
        const placedRecipients = [customerEmail, ...(billingEmails ?? [])].filter(Boolean)
        if (placedRecipients.length > 0) {
          await sendEmail({
            to: placedRecipients,
            subject: 'We received your order',
            html: emailOrderReceived({ customerName, total, items }),
          })
        }
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

      // ── Customer: quotation sent ───────────────────────────────
      case 'quote_sent': {
        const { quoteNumber, customerEmail, customerName, validUntil, total, items, billingEmails } = payload
        const recipients = [customerEmail, ...(billingEmails ?? [])].filter(Boolean)
        if (recipients.length > 0) {
          await sendEmail({
            to: recipients,
            subject: `Quotation #${quoteNumber} from SPika Oil`,
            html: emailQuoteSent({ quoteNumber, customerName, validUntil, total, items }),
          })
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
