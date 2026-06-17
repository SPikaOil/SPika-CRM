import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

async function assertAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

function mapBusinessType(bt: string): string {
  const m: Record<string, string> = {
    'Retailer': 'shops',
    'Wholesaler': 'wholesale',
    'Restaurant/Café': 'horeca',
    'Hotel': 'horeca',
    'Supermarket': 'supermarket',
    'Fuel station': 'other',
    'Other': 'other',
  }
  return m[bt] ?? 'other'
}

// POST /api/admin/access-requests/[id] — approve, deny, resend, or send_access
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { action, notes } = await req.json() // action: 'approve' | 'deny' | 'resend' | 'send_access'

  const admin = createAdminClient()

  const { data: request, error: reqError } = await admin
    .from('access_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqError || !request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (action === 'resend') {
    if (request.status !== 'link_sent' && request.status !== 'approved') return NextResponse.json({ error: 'Can only resend for invited requests' }, { status: 409 })
    // Send a password reset email — acts as "set your password" for new users
    const serverClient = await createServerClient()
    const { error: resetError } = await serverClient.auth.resetPasswordForEmail(request.email, {
      redirectTo: `${APP_URL}/portal`,
    })
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'send_access') {
    // Only valid for approved_pending_setup status
    if (request.status !== 'approved_pending_setup') {
      return NextResponse.json({ error: 'Can only send access for approved_pending_setup requests' }, { status: 409 })
    }

    // Update users row: set role to 'customer' (they can now access the portal)
    if (request.user_id) {
      await admin.from('users').update({ role: 'customer' }).eq('id', request.user_id)
    }

    // Send approval email
    await sendEmail({
      to: request.email,
      subject: 'Your SPika B2B account is ready!',
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <h1 style="color:#dc2626;">🔥 SPika Oil</h1>
  <h2>Your account is approved!</h2>
  <p>Hi ${request.name},</p>
  <p>Great news — your SPika B2B account for <strong>${request.company_name}</strong> has been approved and is ready to use.</p>
  <p>Your pricing and account details have been set up. You can now log in and start placing orders.</p>
  <a href="${APP_URL}/portal" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Log in to Portal →</a>
  <p style="margin-top:24px;color:#666;font-size:14px;">Questions? hello@spikaoil.nl or WhatsApp +5999 689-6969.</p>
</div>`,
    })

    // Update access_request status
    await admin.from('access_requests').update({ status: 'approved' }).eq('id', id)

    return NextResponse.json({ ok: true })
  }

  if (request.status !== 'pending') return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })

  if (action === 'deny') {
    await admin.from('access_requests').update({
      status: 'denied',
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    const onboarding_data = request.onboarding_data ?? {}

    const isCuracao = request.country?.toLowerCase().includes('cura') ?? false
    const ob_form_required = isCuracao

    const billingAddress = {
      street: onboarding_data.address || '',
      city: onboarding_data.city || '',
      zip: onboarding_data.zip || '',
      country: request.country || '',
    }

    // Build pre-filled customer payload
    const customerPayload = {
      company_name: request.company_name,
      contact_person: request.name,
      email: request.email,
      phone: onboarding_data.phone || null,
      whatsapp: onboarding_data.whatsapp || null,
      status: 'active',
      customer_category: mapBusinessType(onboarding_data.business_type ?? ''),
      billing_address: billingAddress,
      delivery_address: billingAddress,
      vat_number: onboarding_data.vat_number || null,
      crib_number: onboarding_data.crib_number || null,
      coc_number: onboarding_data.coc_number || null,
      ob_form_required,
      is_international: !isCuracao,
      payment_term_days: 7,
    }

    // Create customer record
    const { data: customer, error: custError } = await admin
      .from('customers')
      .insert(customerPayload)
      .select('id')
      .single()

    if (custError || !customer) {
      return NextResponse.json({ error: custError?.message || 'Failed to create customer' }, { status: 500 })
    }

    if (request.user_id) {
      // Self-registered user — update existing users row (keep role as 'prospect' until send_access)
      await admin.from('users').update({
        customer_id: customer.id,
      }).eq('id', request.user_id)

      await admin.from('access_requests').update({
        status: 'approved_pending_setup',
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      }).eq('id', id)

      return NextResponse.json({ ok: true, customer_id: customer.id })
    }

    // Old flow — no user_id: invite user by email
    const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(
      request.email,
      { redirectTo: `${APP_URL}/portal` }
    )

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to invite user' }, { status: 500 })
    }

    await admin.from('users').insert({
      id: authData.user.id,
      email: request.email,
      name: request.name,
      role: 'customer',
      customer_id: customer.id,
    })

    // Mark request as link_sent — moves to accepted once customer logs in
    await admin.from('access_requests').update({
      status: 'link_sent',
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    }).eq('id', id)

    return NextResponse.json({ ok: true, customer_id: customer.id })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
