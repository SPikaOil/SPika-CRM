import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company_name, phone, message } = body

  if (!name || !email || !company_name) {
    return NextResponse.json({ error: 'Name, email and company name are required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  // Check for duplicate pending request
  const { data: existing } = await supabase
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A request for this email is already pending' }, { status: 409 })
  }

  const { error } = await supabase.from('access_requests').insert({
    name,
    email,
    company_name,
    phone: phone || null,
    message: message || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
