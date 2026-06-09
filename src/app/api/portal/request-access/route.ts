import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company_name, phone, message } = body

  if (!name || !email || !company_name) {
    return NextResponse.json({ error: 'Name, email and company name are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check for duplicate pending request
  const { data: existing } = await admin
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A request for this email is already pending' }, { status: 409 })
  }

  const { error } = await admin.from('access_requests').insert({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    company_name: String(company_name).trim(),
    phone: phone ? String(phone).trim() : null,
    message: message ? String(message).trim() : null,
  })

  if (error) {
    console.error('access_requests insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
