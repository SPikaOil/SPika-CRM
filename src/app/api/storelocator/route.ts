import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Public data for the embedded store locator. Uses the service role so it can
// enforce the rule: a pin only shows if it is switched on (active) AND — when
// linked to a customer — that customer is active. Deactivating a customer in
// the CRM therefore hides their pin automatically, no separate toggle needed.
export async function GET() {
  const admin = createAdminClient()

  const [{ data: pins }, { data: inactive }] = await Promise.all([
    admin.from('store_locations')
      .select('id, name, address, lat, lng, category, link_url, customer_id')
      .eq('active', true),
    admin.from('customers').select('id').eq('status', 'inactive'),
  ])

  const inactiveIds = new Set((inactive ?? []).map((c: any) => c.id))
  const visible = (pins ?? [])
    .filter((p: any) => !p.customer_id || !inactiveIds.has(p.customer_id))
    .map(({ customer_id, ...rest }: any) => rest) // don't expose the link publicly

  return NextResponse.json(
    { pins: visible },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  )
}
