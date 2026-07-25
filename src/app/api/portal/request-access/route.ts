import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company_name, country, phone, message } = body

  if (!name || !email || !company_name) {
    return NextResponse.json({ error: 'Name, email and company name are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { error } = await supabase.from('access_requests').insert({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    company_name: String(company_name).trim(),
    country: country ? String(country).trim() : null,
    phone: phone ? String(phone).trim() : null,
    message: message ? String(message).trim() : null,
  })

  if (error) {
    console.error('access_requests insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
