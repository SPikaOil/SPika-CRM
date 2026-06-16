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

  const { customer_id } = await req.json()
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch the customer
  const { data: customer, error: custError } = await admin
    .from('customers')
    .select('id, email, contact_person, company_name')
    .eq('id', customer_id)
    .single()
  if (custError || !customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!customer.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

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
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(customer.email, {
      redirectTo: `${APP_URL}/portal`,
    })

    if (inviteError) {
      // User already exists in auth but has no portal profile — find them and send a reset link
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const authUser = authUsers.find(u => u.email === customer.email)
      if (!authUser) return NextResponse.json({ error: inviteError.message }, { status: 400 })
      authUserId = authUser.id

      const serverClient = await createServerClient()
      await serverClient.auth.resetPasswordForEmail(customer.email, {
        redirectTo: `${APP_URL}/portal`,
      })
    } else {
      authUserId = inviteData.user.id
    }

    // Create users profile row
    const { error: profileError } = await admin.from('users').insert({
      id: authUserId,
      email: customer.email,
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
