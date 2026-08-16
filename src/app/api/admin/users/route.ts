import { checkPassword } from '@/lib/password'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Guard: only admins can call these routes
async function assertAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// GET /api/admin/users — list all staff users with last login
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data: profiles, error } = await admin
    .from('users')
    .select('*')
    .in('role', ['admin', 'sales'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(profiles)
}

// POST /api/admin/users — create a new staff user
export async function POST(req: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, name, role, phone, password } = await req.json()
  if (!email || !name || !role || !password) {
    return NextResponse.json({ error: 'email, name, role and password are required' }, { status: 400 })
  }

  // Checked here as well as in the form: the form is a screen, this is the
  // rule. Calling this route directly used to accept a password of any length.
  const tooShort = checkPassword(password)
  if (tooShort) return NextResponse.json({ error: tooShort }, { status: 400 })

  const admin = createAdminClient()

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  // Write the profile row. The on_auth_user_created trigger has already created
  // it with the safe default role, so this must UPSERT — a plain insert hits a
  // duplicate primary key and the rollback below deletes the fresh account.
  // Upserting is also what applies the role the admin actually picked.
  const { data: profile, error: profileError } = await admin.from('users').upsert({
    id: authData.user.id,
    email,
    name,
    role,
    phone: phone ?? '',
    customer_id: null,
  }).select().single()

  if (profileError) {
    // Rollback auth user if profile insert fails
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(profile, { status: 201 })
}
