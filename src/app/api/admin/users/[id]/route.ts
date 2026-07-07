import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// Revoke all active sessions for a user. Banning only blocks new logins and
// token refresh — an existing session stays valid until its JWT expires,
// so we explicitly log the user out everywhere. Best-effort: a failure here
// must not block the deactivation itself.
async function revokeSessions(userId: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
  } catch {
    // ignore — ban still blocks token refresh within the hour
  }
}

// GET /api/admin/users/[id] — open work still assigned to this user
// (used to warn before deactivating; history is never touched)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()

  const [leads, orders, tasks] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true })
      .eq('assigned_to', id).not('stage', 'in', '(won,lost)'),
    admin.from('orders').select('id', { count: 'exact', head: true })
      .eq('assigned_to', id).in('status', ['pending_approval', 'processing', 'out_for_delivery']),
    admin.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assigned_to', id).is('completed_at', null),
  ])

  return NextResponse.json({
    openLeads: leads.count ?? 0,
    openOrders: orders.count ?? 0,
    openTasks: tasks.count ?? 0,
  })
}

// PATCH /api/admin/users/[id] — update name, role, phone, reset password, or reactivate
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const admin = createAdminClient()

  // Password reset
  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Reactivate: lift the ban and restore visibility in one operation.
  // is_active is never writable on its own — it must move together with the ban.
  if (body.reactivate === true) {
    const { error: unbanError } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
    if (unbanError) return NextResponse.json({ error: unbanError.message }, { status: 400 })

    const { data, error } = await admin.from('users')
      .update({ is_active: true }).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Profile update (name, role, phone)
  const updates: Record<string, string> = {}
  if (body.name)  updates.name  = body.name
  if (body.role)  updates.role  = body.role
  if (body.phone !== undefined) updates.phone = body.phone

  const { data, error } = await admin.from('users').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/users/[id] — deactivate user:
// ban login + revoke active sessions + mark inactive. Data stays intact.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === caller.id) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }
  const admin = createAdminClient()

  // 1. Ban the auth user (blocks new logins and token refresh)
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 2. Kill any session that is still alive right now
  await revokeSessions(id)

  // 3. Mark the profile inactive so the app can filter dropdowns and grey out the team list
  const { data, error: flagError } = await admin.from('users')
    .update({ is_active: false }).eq('id', id).select().single()
  if (flagError) return NextResponse.json({ error: flagError.message }, { status: 500 })

  return NextResponse.json(data)
}
