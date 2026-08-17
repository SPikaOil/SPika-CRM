import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/portal/account-manager — who a reseller can reach at SPika.
 *
 * A server route rather than a query, because a portal account may not read
 * anyone else's row in `users` and that must stay true: migration 076 closed a
 * privilege escalation there and nothing should widen it again. So this runs on
 * the service key and hands back exactly three fields.
 *
 * The customer is taken from the SESSION, never from a parameter — otherwise
 * any signed-in account could ask for another reseller's contact by id.
 */
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users').select('customer_id').eq('id', user.id).single()
  if (!profile?.customer_id) return NextResponse.json({ manager: null })

  const { data: customer } = await admin
    .from('customers').select('assigned_to').eq('id', profile.customer_id).single()
  if (!customer?.assigned_to) return NextResponse.json({ manager: null })

  const { data: manager } = await admin
    .from('users')
    .select('name, email, phone, is_active')
    .eq('id', customer.assigned_to)
    .single()

  // Somebody who has left keeps their row but not their place on the card.
  if (!manager || manager.is_active === false) return NextResponse.json({ manager: null })

  return NextResponse.json({
    manager: { name: manager.name, email: manager.email, phone: manager.phone },
  })
}
