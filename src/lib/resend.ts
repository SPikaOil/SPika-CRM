export const FROM = process.env.EMAIL_FROM ?? 'SPika CRM <hello@spikaoil.nl>'
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'hello@spikaoil.nl'

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}) {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) {
    console.log('[email] SMTP credentials not configured — skipping:', subject)
    return
  }
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.strato.nl',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    })
    await transporter.sendMail({
      from: FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    })
  } catch (err) {
    console.error('[email] Failed to send:', err)
  }
}

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

export function emailOrderPlaced(p: { orderNumber: string; customerName: string; total: string; items: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New order received</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A customer placed a new order via the portal.</p>
    ${badge('Pending Approval', '#f59e0b')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
      ${row('Customer', p.customerName)}
      ${row('Total', p.total)}
      ${row('Products', p.items)}
    </table>
    ${button('View Order', 'https://spika-crm.vercel.app/orders')}
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
    ${button('View My Orders', 'https://spika-crm.vercel.app/portal')}
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
    ${button('Start Delivery', 'https://spika-crm.vercel.app/orders')}
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
      ${button('View Order', 'https://spika-crm.vercel.app/orders')}
    `)
  }
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Your order has been delivered!</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, your order has been delivered. Thank you for your business!</p>
    ${badge('Delivered', '#8b5cf6')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
    </table>
    ${button('View My Orders', 'https://spika-crm.vercel.app/portal')}
  `)
}

export function emailInvoiceReady(p: { orderNumber: string; customerName: string; total: string }) {
  return layout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Your invoice is ready</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${p.customerName}, your invoice for order #${p.orderNumber} is ready.</p>
    ${badge('Invoice Ready', '#22c55e')}
    <table style="margin-top:16px;width:100%;border-collapse:collapse;">
      ${row('Order #', p.orderNumber)}
      ${row('Amount', p.total)}
    </table>
    ${button('View My Orders', 'https://spika-crm.vercel.app/portal')}
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
    ${button('View Customers', 'https://spika-crm.vercel.app/customers')}
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
    ${button('View Customers', 'https://spika-crm.vercel.app/customers')}
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
    ${button('View Tasks', 'https://spika-crm.vercel.app/agenda')}
  `)
}
