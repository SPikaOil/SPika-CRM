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
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
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


// Templates live in email-templates.ts (no transport code) so the in-app
// preview can render them client-side. Re-exported here so every existing
// import from '@/lib/resend' keeps working.
export * from './email-templates'
