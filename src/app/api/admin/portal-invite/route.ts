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

/**
 * A customer may have SEVERAL portal logins — her decision of 2026-08-19.
 *
 * A shop has a buyer and a branch manager and both order; until now the second
 * one could not be given access, and worse, typing their address on a customer
 * that already had a login quietly sent a password reset to the FIRST address
 * and told you it had been sent. That is the fault this route no longer has.
 *
 * All logins of one customer are equal and see exactly the same: same orders,
 * same invoices, same prices. Her answer, and it needs no new rule — every
 * portal policy keys off current_user_customer_id(), which reads the customer
 * from the row of whoever is logged in. Five logins on one customer resolve to
 * the same customer, so the whole portal works unchanged. No maximum.
 *
 * The database never forbade this: there is no unique key on users.customer_id,
 * checked against the live schema before building. Nothing here is a migration.
 */

// POST /api/admin/portal-invite — give one more person access, or re-send to
// somebody who already has it.
export async function POST(req: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { customer_id, email } = await req.json()
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  // The address is TYPED for this invitation, not taken off the customer card.
  //
  // Danique, 2026-08-15: "als ik bijv invite wil sturen voor Albert Heijn, dan
  // moet er iets open komen te staan met email adres wat we nog moeten invullen
  // — want billing is nooit degene die besteld."
  //
  // Exactly right: customers.email is an accounts-payable address somebody once
  // wrote down. The person who logs in and places orders is a different human,
  // and this invitation creates THEIR login. Inviting the billing address would
  // hand the portal to the wrong person and make every later mail go there too.
  const inviteEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!inviteEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) === false) {
    return NextResponse.json({ error: 'Fill in the e-mail address of the person who will order' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the customer. Its email is deliberately NOT read — see above.
  const { data: customer, error: custError } = await admin
    .from('customers')
    .select('id, contact_person, company_name')
    .eq('id', customer_id)
    .single()
  if (custError || !customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Does THIS address already have a login? Matched on the e-mail, not on the
  // customer: users.email is unique, so one address is one login and there is
  // nothing to guess. Asking by customer is what used to send the mail to the
  // wrong person.
  const { data: existing } = await admin
    .from('users')
    .select('id, customer_id, role')
    .eq('email', inviteEmail)
    .maybeSingle()

  // The address is in use by a colleague of ours, or by a different reseller.
  // Refused rather than moved: one login belongs to one company, and silently
  // re-pointing it would hand another customer's orders to this one.
  if (existing && existing.customer_id && existing.customer_id !== customer_id) {
    return NextResponse.json(
      { error: 'That e-mail address already belongs to another customer' },
      { status: 409 },
    )
  }
  if (existing && existing.role !== 'customer' && !existing.customer_id) {
    return NextResponse.json(
      { error: 'That e-mail address is a team member — use a different address' },
      { status: 409 },
    )
  }

  const serverClient = await createServerClient()
  let authUserId: string
  const resent = !!(existing && existing.customer_id === customer_id)

  if (existing) {
    // Already has access here — a fresh link to set a password again.
    await serverClient.auth.resetPasswordForEmail(inviteEmail, { redirectTo: `${APP_URL}/portal` })
    authUserId = existing.id
  } else {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: `${APP_URL}/portal`,
    })

    if (inviteError) {
      // Known to auth but carrying no profile of ours — link it and send a reset.
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const authUser = authUsers.find(u => u.email === inviteEmail)
      if (!authUser) return NextResponse.json({ error: inviteError.message }, { status: 400 })
      authUserId = authUser.id
      await serverClient.auth.resetPasswordForEmail(inviteEmail, { redirectTo: `${APP_URL}/portal` })
    } else {
      authUserId = inviteData.user.id
    }

    // Upsert, not insert: the on_auth_user_created trigger already wrote this
    // row with the safe default role, so a plain insert fails on a duplicate
    // primary key and the customer never gets portal access.
    const { error: profileError } = await admin.from('users').upsert({
      id: authUserId,
      email: inviteEmail,
      name: customer.contact_person || customer.company_name,
      role: 'customer',
      phone: '',
      customer_id,
    })
    if (profileError && !profileError.message.includes('duplicate')) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }
  }

  // "Last time somebody here was invited". It was one date for one login; with
  // several it can only mean the most recent, and nothing else reads it.
  await admin
    .from('customers')
    .update({ portal_invited_at: new Date().toISOString() })
    .eq('id', customer_id)

  return NextResponse.json({ success: true, resent })
}

/**
 * DELETE /api/admin/portal-invite — take access away.
 *
 * `user_id` removes ONE login and leaves the colleague's alone. Without it
 * every login of the customer goes, which is what "this reseller is out" means.
 * It used to find "the" login with .maybeSingle(), which would have thrown the
 * moment a second one existed.
 */
export async function DELETE(req: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { customer_id, user_id } = await req.json()
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const admin = createAdminClient()

  let query = admin
    .from('users')
    .select('id')
    .eq('customer_id', customer_id)
    .eq('role', 'customer')
  if (user_id) query = query.eq('id', user_id)

  const { data: portalUsers, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const u of portalUsers ?? []) {
    await admin.auth.admin.deleteUser(u.id)
    await admin.from('users').delete().eq('id', u.id)
  }

  // Only when nobody is left. Removing one of three logins does not mean this
  // reseller was never invited.
  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customer_id)
    .eq('role', 'customer')

  if ((count ?? 0) === 0) {
    await admin.from('customers').update({ portal_invited_at: null }).eq('id', customer_id)
  }

  return NextResponse.json({ success: true, removed: (portalUsers ?? []).length })
}
