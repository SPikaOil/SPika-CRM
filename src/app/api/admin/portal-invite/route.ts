import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

async function assertAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/portal-invite — invite a customer to the portal
export async function POST(req: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { customer_id, email } = await req.json()
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  // The address is TYPED for this invitation, not taken off the customer card.
  //
  // Danique, 2026-08-15: "als ik bijv invite wil sturen voor Albert Heijn, dan
  // moet er iets open komen te staan met email adres wat we nog moeten invullen
  // — want billing is nooit degene die besteld."
  //
  // Exactly right: customers.email is an accounts-payable address somebody once
  // wrote down. The person who logs in and places orders is a different human,
  // and this invitation creates THEIR login. Inviting the billing address would
  // hand the portal to the wrong person and make every later mail go there too.
  const inviteEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
    return NextResponse.json({ error: 'Fill in the e-mail address of the person who will order' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the customer. Its email is deliberately NOT read — see above.
  const { data: customer, error: custError } = await admin
    .from('customers')
    .select('id, contact_person, company_name')
    .eq('id', customer_id)
    .single()
  if (custError || !customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Check if portal user already exists for this customer
  const { data: existing } = await admin
    .from('users')
    .select('id, email')
    .eq('customer_id', customer_id)
    .eq('role', 'customer')
    .maybeSingle()

  let authUserId: string

  if (existing) {
    // Portal profile exists — send a password reset email (works as "set password" for new users too)
    const serverClient = await createServerClient()
    await serverClient.auth.resetPasswordForEmail(existing.email, {
      redirectTo: `${APP_URL}/portal`,
    })
    authUserId = existing.id
  } else {
    // No portal profile yet — try to invite; if email already exists in auth, link them and send reset
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: `${APP_URL}/portal`,
    })

    if (inviteError) {
      // User already exists in auth but has no portal profile — find them and send a reset link
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const authUser = authUsers.find(u => u.email === inviteEmail)
      if (!authUser) return NextResponse.json({ error: inviteError.message }, { status: 400 })
      authUserId = authUser.id

      const serverClient = await createServerClient()
      await serverClient.auth.resetPasswordForEmail(inviteEmail, {
        redirectTo: `${APP_URL}/portal`,
      })
    } else {
      authUserId = inviteData.user.id
    }

    // Upsert, not insert: the on_auth_user_created trigger already wrote this
    // row with the safe default role, so a plain insert fails on a duplicate
    // primary key and the customer never gets portal access.
    const { error: profileError } = await admin.from('users').upsert({
      id: authUserId,
      email: inviteEmail,
      name: customer.contact_person || customer.company_name,
      role: 'customer',
      phone: '',
      customer_id,
    })
    if (profileError) {
      // If profile insert fails (e.g. already exists), still return success — email was sent
      if (!profileError.message.includes('duplicate')) {
        return NextResponse.json({ error: profileError.message }, { status: 500 })
      }
    }
  }

  // Update portal_invited_at on the customer
  await admin
    .from('customers')
    .update({ portal_invited_at: new Date().toISOString() })
    .eq('id', customer_id)

  return NextResponse.json({ success: true, resent: !!existing })
}

// DELETE /api/admin/portal-invite — revoke portal access
export async function DELETE(req: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { customer_id } = await req.json()
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Find the portal user
  const { data: portalUser } = await admin
    .from('users')
    .select('id')
    .eq('customer_id', customer_id)
    .eq('role', 'customer')
    .maybeSingle()

  if (portalUser) {
    // Delete auth user (cascades to users row via FK or we delete manually)
    await admin.auth.admin.deleteUser(portalUser.id)
    await admin.from('users').delete().eq('id', portalUser.id)
  }

  // Clear portal_invited_at
  await admin
    .from('customers')
    .update({ portal_invited_at: null })
    .eq('id', customer_id)

  return NextResponse.json({ success: true })
}
