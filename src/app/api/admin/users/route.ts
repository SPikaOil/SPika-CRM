import { ROLES } from '@/lib/permissions'
import { checkPassword } from '@/lib/password'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { emailTeamInvite } from '@/lib/email-templates'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://s-pika-crm.vercel.app'

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
    // Every internal role, not just admin and sales — a Marketing or Warehouse
    // account simply did not appear on the team page before.
    //
    // ROLES, not INTERNAL_ROLES: that list carries the legacy 'staff' value,
    // which the database enum has never had. Postgres rejects the whole query
    // with 22P02 on an unknown enum value, so one dead name would have emptied
    // the entire team page.
    .in('role', [...ROLES])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with what only the auth side knows: whether this person actually has
  // an authenticator set up, and when they last signed in. Without it an admin
  // can require two-step verification but has no way to see who complied.
  try {
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const byId = new Map(
      (authList?.users ?? []).map(u => [
        u.id,
        {
          has_2fa: (u.factors ?? []).some((f: { status?: string }) => f.status === 'verified'),
          last_sign_in_at: u.last_sign_in_at ?? null,
          // A banned account is one we deactivated; surfaced so the list can
          // never disagree with what login actually does.
          blocked: !!u.banned_until && new Date(u.banned_until) > new Date(),
        },
      ]),
    )
    return NextResponse.json(
      (profiles ?? []).map(p => ({ ...p, ...(byId.get(p.id) ?? { has_2fa: false, last_sign_in_at: null, blocked: false }) })),
    )
  } catch {
    // Auth side unreachable — return the profiles rather than an empty page.
    return NextResponse.json(profiles)
  }
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

  await sendSetPasswordLink({ admin, email, name, role, caller })

  return NextResponse.json(profile, { status: 201 })
}

/**
 * Tell a new colleague their login exists, and let them set their own password.
 *
 * createUser runs with email_confirm: true — "treat this address as confirmed,
 * send nothing" — so until now nobody was ever told. The admin typed a password
 * to get the account made and then had to pass it on by hand, which means the
 * admin knew it.
 *
 * generateLink rather than resetPasswordForEmail: that gives us the URL instead
 * of sending Supabase's own bare template, so the mail goes out in our own house
 * style through the same SMTP as everything else.
 *
 * Never fatal. The account was created; a mail problem must not undo that or
 * make the screen say it failed. The result is reported back so the Team screen
 * can say "created, but the mail did not go out" rather than nothing.
 */
async function sendSetPasswordLink({ admin, email, name, role, caller }: {
  admin: ReturnType<typeof createAdminClient>
  email: string
  name: string
  role: string
  caller: { email?: string | null }
}): Promise<{ sent: boolean }> {
  try {
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${APP_URL}/security` },
    })
    if (error || !link?.properties?.action_link) return { sent: false }

    // Only promised when it is true for this person — an admin decides two-step
    // per colleague from the Team screen, so most of them will not see this.
    const { data: profile } = await admin
      .from('users').select('mfa_required').eq('email', email).single()

    const result = await sendEmail({
      to: email,
      subject: 'Your SPika login',
      html: emailTeamInvite({
        name: name || email,
        invitedBy: caller.email ?? 'An admin',
        role,
        link: link.properties.action_link,
        mfaRequired: !!profile?.mfa_required,
      }),
    })
    return { sent: result.ok }
  } catch {
    return { sent: false }
  }
}
