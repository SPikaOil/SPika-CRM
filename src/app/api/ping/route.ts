import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdminClient()
  await admin.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
