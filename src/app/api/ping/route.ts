import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Update last_seen_at on the user profile
  const { data: profile } = await admin.from('users').update({ last_seen_at: now }).eq('id', user.id).select('customer_id').single()

  // If this is a customer user, also update the customers table
  if (profile?.customer_id) {
    await admin.from('customers').update({ last_seen_at: now }).eq('id', profile.customer_id)
  }

  return NextResponse.json({ ok: true })
}
