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

// PATCH /api/admin/users/[id] — update name, role, phone OR reset password
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

  // Profile update (name, role, phone)
  const updates: Record<string, string> = {}
  if (body.name)  updates.name  = body.name
  if (body.role)  updates.role  = body.role
  if (body.phone !== undefined) updates.phone = body.phone

  const { data, error } = await admin.from('users').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/users/[id] — deactivate (ban) user
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()

  // Ban the auth user (keeps data intact, just blocks login)
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
