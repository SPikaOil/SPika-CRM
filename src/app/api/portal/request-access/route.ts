import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { sendEmail, ADMIN_EMAIL, emailAccessRequestAdmin } from '@/lib/resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company_name, country, phone, message } = body

  if (!name || !email || !company_name) {
    return NextResponse.json({ error: 'Name, email and company name are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { error } = await supabase.from('access_requests').insert({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    company_name: String(company_name).trim(),
    country: country ? String(country).trim() : null,
    phone: phone ? String(phone).trim() : null,
    message: message ? String(message).trim() : null,
  })

  if (error) {
    console.error('access_requests insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Tell the admin a request came in. This notification used to live in the
  // onboarding route, which only self-registered users reached — and
  // self-registration is closed, so without this nobody would be emailed at all.
  //
  // AWAITED, not fired and forgotten. On Vercel the function is frozen the
  // moment the response is returned, so an un-awaited send is simply cut off
  // mid-flight: the request landed in the database and the owner was never
  // told. Every notification that does arrive is awaited; the two that never
  // arrived were the two that were not. The intent behind the old comment —
  // a mail problem must never lose the request — is kept by the try/catch:
  // the row is already written by this point, so a failure here only costs
  // the notification.
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `New access request from ${String(company_name).trim()}`,
      html: emailAccessRequestAdmin({
        companyName: String(company_name).trim(),
        name: String(name).trim(),
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : null,
        country: country ? String(country).trim() : null,
        message: message ? String(message).trim() : null,
        appUrl: APP_URL,
      }),
    })
  } catch (err) {
    console.error('[email] access request notification failed:', err)
  }

  return NextResponse.json({ ok: true })
}
