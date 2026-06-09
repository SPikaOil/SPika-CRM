import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// POST /api/portal/confirm — called when a customer first logs in to mark their invite as accepted
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Only update if still in link_sent state — idempotent
  await admin
    .from('access_requests')
    .update({ status: 'accepted' })
    .eq('email', user.email!)
    .eq('status', 'link_sent')

  return NextResponse.json({ ok: true })
}
