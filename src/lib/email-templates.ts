// Email templates — pure HTML builders, no transport.
// Kept separate from resend.ts so they can also be rendered in the in-app
// preview (/email-preview) without pulling the mail transport into the browser.

// Every button in these emails points here. It used to be hardcoded to
// spika-crm.vercel.app in nine places — a domain that does not resolve — so
// customers clicking "View My Orders" landed nowhere.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

// ─── Shared styles ────────────────────────────────────────────────
const LOGO_COLOR = '#dc2626'

function layout(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:${LOGO_COLOR};padding:20px 28px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">🔥 SPika CRM</span>
        </td></tr>
        <tr><td style="padding:28px;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;background:#fafafa;">
          <p style="margin:0;font-size:12px;color:#888;">SPika Oil · hello@spikaoil.nl · This is an automated message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function badge(text: string, color = '#f59e0b') {
  return `<span style="display:inline-block;background:${color}20;color:${color};border-radius:6px;padding:2px 10px;font-size:12px;font-weight:600;">${text}</span>`
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;">${label}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111;">${value}</td>
  </tr>`
}

function button(text: string, href: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;background:${LOGO_COLOR};color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">${text}</a>`
}

// ─── Email templates ───────────────────────────────────────────────

export function emailOrderPlaced(p: { customerName: string; total: string; items: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New order request</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A customer placed an order request via the portal. Assign an order number and delivery date to process it.</p>
    ${badge('Pending Approval', '#f59e0b')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Customer', p.customerName)}
      ${row('Total', p.total)}
      ${row('Products', p.items)}
    </table>
    ${button('View Order', APP_URL + '/orders')}
  `)
}

export function emailOrderConfirmed(p: { orderNumber: string; customerName: string; plannedDate?: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Your order is confirmed!</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, we've approved your order and it's being prepared for delivery.</p>
    ${badge('Processing', '#eab308')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
      ${p.plannedDate ? row('Planned delivery', p.plannedDate) : ''}
    </table>
    ${button('View My Orders', APP_URL + '/portal')}
  `)
}

export function emailOutForDelivery(p: { orderNumber: string; customerName: string; workerName: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New delivery assigned to you</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.workerName}, a new order is ready for you to deliver.</p>
    ${badge('Ready for Delivery', '#3b82f6')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
      ${row('Customer', p.customerName)}
    </table>
    ${button('Start Delivery', APP_URL + '/orders')}
  `)
}

export function emailOrderDelivered(p: { orderNumber: string; customerName: string; isAdmin: boolean }) {
  if (p.isAdmin) {
    return layout(`
      <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Order delivered</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">An order has been successfully delivered.</p>
      ${badge('Delivered', '#8b5cf6')}
      <table style="margin-top:16px;width:100%;border-collapse:collapse;">
        ${row('Order #', p.orderNumber)}
        ${row('Customer', p.customerName)}
      </table>
      ${button('View Order', APP_URL + '/orders')}
    `)
  }
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Your order has been delivered!</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, your order has been delivered. Thank you for your business!</p>
    ${badge('Delivered', '#8b5cf6')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
    </table>
    ${button('View My Orders', APP_URL + '/portal')}
  `)
}

export function emailInvoiceReady(p: { orderNumber: string; customerName: string; total: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Your invoice is ready</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, your invoice for order #${p.orderNumber} is ready.</p>
    ${badge('Send Invoice', '#22c55e')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
      ${row('Amount', p.total)}
    </table>
    ${button('View My Orders', APP_URL + '/portal')}
  `)
}

export function emailHandoverReceipt(p: {
  memberName: string
  batchNumber?: string | null
  handoverDate?: string | null
  items: { name: string; qty: number }[]
  signedAt: string
  notes?: string
}) {
  const itemRows = p.items
    .map(i => row(i.name, `${i.qty}×`))
    .join('')
  // Plain one-line summary, e.g. "11 July 2026 — 120× 100ml · 60× 50ml"
  const summary = [
    p.handoverDate,
    p.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · '),
  ].filter(Boolean).join(' — ')
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Bottles received for delivery</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      Hi ${p.memberName}, you signed for receipt of the following bottles. You are responsible for these until delivery.
    </p>
    ${badge('Handover confirmed', '#16a34a')}
    <p style="margin:16px 0 4px;font-size:16px;font-weight:600;color:#111;">${summary}</p>
    <table style="margin-top:12px;width:100%;border-collapse:collapse;">
      ${p.batchNumber ? row('Batch', p.batchNumber) : ''}
      ${p.handoverDate ? row('Handover date', p.handoverDate) : ''}
      ${itemRows}
      ${row('Signed at', p.signedAt)}
    </table>
    ${p.notes ? `<p style="margin-top:12px;color:#6b7280;font-size:13px;">Note: ${p.notes}</p>` : ''}
  `)
}

export function emailOBFormSigned(p: { customerName: string; signerName: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">OB form signed</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A customer has signed the OB Declaratie Formulier 2026.</p>
    ${badge('OB Form', '#6366f1')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Company', p.customerName)}
      ${row('Signed by', p.signerName)}
    </table>
    ${button('View Customers', APP_URL + '/customers')}
  `)
}

export function emailNewCustomer(p: { customerName: string; email: string; category: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New customer added</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A new customer has been added to the CRM.</p>
    ${badge('New Customer', '#14b8a6')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Company', p.customerName)}
      ${row('Email', p.email || '—')}
      ${row('Category', p.category)}
    </table>
    ${button('View Customers', APP_URL + '/customers')}
  `)
}

export function emailQuoteSent(p: { quoteNumber: string; customerName: string; validUntil: string; total: string; items: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">You have received a quotation</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, please find your quotation details below.</p>
    ${badge('Quotation', '#6366f1')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Quote #', p.quoteNumber)}
      ${row('Total', `XCG ${p.total}`)}
      ${row('Valid until', p.validUntil)}
      ${row('Products', p.items)}
    </table>
    <p style="margin-top:16px;font-size:13px;color:#6b7280;">To confirm your order or for any questions, please contact us via WhatsApp or email. This quotation does not constitute an invoice — no payment is required at this stage.</p>
  `)
}

export function emailTaskAssigned(p: { workerName: string; taskTitle: string; customerName?: string; dueDate?: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New task assigned to you</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.workerName}, you have a new task.</p>
    ${badge('Task', '#f97316')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Task', p.taskTitle)}
      ${p.customerName ? row('Customer', p.customerName) : ''}
      ${p.dueDate ? row('Due date', p.dueDate) : ''}
    </table>
    ${button('View Tasks', APP_URL + '/agenda')}
  `)
}

export function emailTaskCompleted(p: { taskTitle: string; completedBy: string; customerName?: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Task completed ✓</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A task has been marked as done.</p>
    ${badge('Completed', '#16a34a')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Task', p.taskTitle)}
      ${p.customerName ? row('Customer', p.customerName) : ''}
      ${row('Completed by', p.completedBy)}
    </table>
    ${button('View Tasks', `${APP_URL}/tasks`)}
  `)
}

export function emailOrderModified(p: { orderNumber: string; customerName: string; items: string; total: string }) {
  return layout(`
    <tr><td style="padding:28px 28px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Order Modified</p>
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Order #${p.orderNumber} was modified</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>${p.customerName}</strong> has updated their order. Please review and re-confirm.
      </p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Updated items:</p>
        <p style="margin:0;font-size:14px;color:#6b7280;">${p.items}</p>
        <p style="margin:8px 0 0;font-size:14px;font-weight:700;color:#111827;">Total: ${p.total}</p>
      </div>
    </td></tr>
  `)
}

export function emailOrderModifiedConfirmation(p: { orderNumber: string; customerName: string }) {
  return layout(`
    <tr><td style="padding:28px 28px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Order Update</p>
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Changes received!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${p.customerName},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        We've received your updated order <strong>#${p.orderNumber}</strong>. Our team will review and confirm it shortly.
      </p>
      <p style="margin:0;font-size:15px;color:#374151;">
        Questions? Contact us at <a href="mailto:hello@spikaoil.nl" style="color:#dc2626;">hello@spikaoil.nl</a>.
      </p>
    </td></tr>
  `)
}

// ─── Portal onboarding mails ──────────────────────────────────────
// NOTE: these two do NOT use layout() — they were written separately and look
// plainer than the 13 above (no red header bar, no footer). Kept exactly as
// they are sent today so the preview shows the truth, not an idealised version.

export function emailAccountApproved(p: { name: string; companyName: string; appUrl: string }) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <h1 style="color:#dc2626;">🔥 SPika Oil</h1>
  <h2>Your account is approved!</h2>
  <p>Hi ${p.name},</p>
  <p>Great news — your SPika B2B account for <strong>${p.companyName}</strong> has been approved and is ready to use.</p>
  <p>Your pricing and account details have been set up. You can now log in and start placing orders.</p>
  <a href="${p.appUrl}/portal" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Log in to Portal →</a>
  <p style="margin-top:24px;color:#666;font-size:14px;">Questions? hello@spikaoil.nl or WhatsApp +5999 689-6969.</p>
</div>`
}

export function emailAccessRequestAdmin(p: {
  companyName: string; name: string; email: string
  phone?: string | null; country?: string | null; message?: string | null; appUrl: string
}) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <h1 style="color:#dc2626;">🔥 SPika Oil</h1>
  <h2>New access request</h2>
  <p><strong>${p.companyName}</strong></p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 0;color:#6b7280;">Contact</td><td style="padding:4px 0;">${p.name}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td style="padding:4px 0;">${p.email}</td></tr>
    ${p.phone ? `<tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;">${p.phone}</td></tr>` : ''}
    ${p.country ? `<tr><td style="padding:4px 0;color:#6b7280;">Country</td><td style="padding:4px 0;">${p.country}</td></tr>` : ''}
  </table>
  ${p.message ? `<p style="margin-top:16px;color:#374151;">"${p.message}"</p>` : ''}
  <p style="margin-top:24px;"><a href="${p.appUrl}/portal-management" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Review request</a></p>
</div>`
}
