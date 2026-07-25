export const FROM = process.env.EMAIL_FROM ?? 'SPika CRM <hello@spikaoil.nl>'
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'hello@spikaoil.nl'

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed'; error?: string }

/**
 * Sends an email and REPORTS what happened. It never throws, so a mail problem
 * can't take down the action that triggered it — but it no longer swallows the
 * outcome either: previously a missing SMTP config just logged and returned, so
 * nothing was sent and nobody could tell.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}): Promise<SendResult> {
  const recipients = Array.isArray(to) ? to.join(', ') : to
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpUser || !smtpPass) {
    console.error(
      `[email] NOT SENT — SMTP_USER/SMTP_PASS missing. Subject: "${subject}" → ${recipients}`,
    )
    return { ok: false, reason: 'not_configured' }
  }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.strato.nl',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })
    await transporter.sendMail({ from: FROM, to: recipients, subject, html })
    console.log(`[email] sent "${subject}" → ${recipients}`)
    return { ok: true }
  } catch (err: any) {
    console.error(
      `[email] FAILED "${subject}" → ${recipients}:`,
      err?.message ?? err,
    )
    return { ok: false, reason: 'send_failed', error: err?.message ?? String(err) }
  }
}


// Templates live in email-templates.ts (no transport code) so the in-app
// preview can render them client-side. Re-exported here so every existing
// import from '@/lib/resend' keeps working.
export * from './email-templates'
