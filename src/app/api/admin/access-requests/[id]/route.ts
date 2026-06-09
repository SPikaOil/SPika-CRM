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

// POST /api/admin/access-requests/[id] — approve or deny
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { action, notes } = await req.json() // action: 'approve' | 'deny'

  const admin = createAdminClient()

  const { data: request, error: reqError } = await admin
    .from('access_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqError || !request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })

  if (action === 'deny') {
    await admin.from('access_requests').update({
      status: 'denied',
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    // Create customer record
    const { data: customer, error: custError } = await admin
      .from('customers')
      .insert({
        company_name: request.company_name,
        contact_person: request.name,
        email: request.email,
        phone: request.phone || null,
        status: 'active',
        customer_category: 'other',
      })
      .select('id')
      .single()

    if (custError || !customer) {
      return NextResponse.json({ error: custError?.message || 'Failed to create customer' }, { status: 500 })
    }

    // Invite user — creates auth user AND sends invite email with set-password link
    const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(
      request.email,
      { redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') ? 'https://s-pika-crm.vercel.app' : 'https://s-pika-crm.vercel.app'}/portal` }
    )

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to invite user' }, { status: 500 })
    }

    await admin.from('users').insert({
      id: authData.user.id,
      email: request.email,
      name: request.name,
      role: 'customer',
      customer_id: customer.id,
    })

    // Mark request as link_sent — moves to accepted once customer logs in
    await admin.from('access_requests').update({
      status: 'link_sent',
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    }).eq('id', id)

    return NextResponse.json({ ok: true, customer_id: customer.id })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
