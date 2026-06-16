import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, ADMIN_EMAIL } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    country,
    business_type,
    address,
    city,
    vat_number,
    website,
    products,
    monthly_volume,
    referral_source,
    notes,
  } = body

  const meta = user.user_metadata ?? {}
  const name: string = meta.name ?? ''
  const company_name: string = meta.company_name ?? ''
  const email = user.email ?? ''

  const admin = createAdminClient()

  // Upsert users row with role: 'prospect'
  const { error: userError } = await admin.from('users').upsert({
    id: user.id,
    email,
    name,
    role: 'prospect',
    customer_role: 'owner',
  }, { onConflict: 'id' })

  if (userError) {
    console.error('[onboarding] Failed to upsert user:', userError)
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  // Create access_request
  const onboarding_data = {
    business_type,
    address,
    city,
    products,
    monthly_volume,
    referral_source,
    notes: notes || null,
    vat_number: vat_number || null,
    website: website || null,
  }

  const { error: reqError } = await admin.from('access_requests').insert({
    user_id: user.id,
    name,
    email,
    company_name,
    country: country || null,
    status: 'pending',
    onboarding_data,
    onboarding_completed_at: new Date().toISOString(),
  })

  if (reqError) {
    console.error('[onboarding] Failed to create access_request:', reqError)
    return NextResponse.json({ error: reqError.message }, { status: 500 })
  }

  // Notify admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New access request from ${company_name}`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <h1 style="color:#dc2626;">🔥 SPika Oil</h1>
  <h2>New access request</h2>
  <p>New access request from <strong>${company_name}</strong> (${name}, ${email}) — ${business_type}, ${monthly_volume}/month.</p>
  <a href="https://s-pika-crm.vercel.app/portal-management" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Log in to review →</a>
</div>`,
  })

  return NextResponse.json({ ok: true })
}
