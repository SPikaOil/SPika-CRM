import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company_name, phone, message } = body

  if (!name || !email || !company_name) {
    return NextResponse.json({ error: 'Name, email and company name are required' }, { status: 400 })
  }

  const supabase = await createClient()

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
