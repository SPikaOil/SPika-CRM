import { INTERNAL_ROLES } from '@/lib/permissions'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the caller is a customer owner
  const { data: profile } = await supabase.from('users').select('customer_id, customer_role, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'customer') return NextResponse.json({ error: 'Not a customer account' }, { status: 403 })
  if (profile.customer_role !== 'owner') return NextResponse.json({ error: 'Only account owners can invite contacts' }, { status: 403 })
  if (!profile.customer_id) return NextResponse.json({ error: 'No customer linked' }, { status: 400 })

  const { email, name } = await req.json()
  if (!email || !name) return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })

  const admin = createAdminClient()

  // Check if user already exists
  const { data: { users: existing } } = await admin.auth.admin.listUsers()
  const existingUser = existing.find(u => u.email === email)

  if (existingUser) {
    // Check if already linked to this customer
    const { data: existingProfile } = await admin.from('users').select('customer_id, role').eq('id', existingUser.id).single()
    if (existingProfile?.customer_id === profile.customer_id) {
      return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
    }
    if (existingProfile?.customer_id) {
      return NextResponse.json({ error: 'This email is already linked to another account' }, { status: 409 })
    }

    // Never absorb an internal account. Staff have no customer_id, so without
    // this guard a portal owner could "invite" a SPika email address and the
    // link below would rewrite that account to role 'customer' — demoting an
    // admin out of their own system.
    // Shared list, so a new team role can never be invited into the portal by
    // accident — see lib/permissions.ts.
    if (existingProfile?.role && INTERNAL_ROLES.includes(existingProfile.role)) {
      return NextResponse.json({ error: 'This email cannot be added' }, { status: 409 })
    }

    // Link existing user to this customer as member
    await admin.from('users').update({
      customer_id: profile.customer_id,
      customer_role: 'member',
      role: 'customer',
    }).eq('id', existingUser.id)

    return NextResponse.json({ ok: true, existing: true })
  }

  // Invite new user via Supabase Auth
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/portal`,
    data: { name },
  })
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

  // Create profile as customer member
  await admin.from('users').upsert({
    id: invited.user.id,
    email,
    name,
    role: 'customer',
    customer_id: profile.customer_id,
    customer_role: 'member',
  })

  return NextResponse.json({ ok: true, existing: false })
}
