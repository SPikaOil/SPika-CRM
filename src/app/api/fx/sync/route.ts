import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Store the exchange rate for a day.
 *
 *   POST /api/fx/sync            → today
 *   POST /api/fx/sync?date=YYYY-MM-DD → that day (used when a delivery is
 *                                      completed, so the invoice date always
 *                                      has a rate before the DB trigger reads it)
 *
 * There is no published EUR/XCG quote, so the rate is built from the two legs
 * that do exist: the ECB reference rate EUR->USD, multiplied by the house
 * USD->XCG rate from company_settings. USD itself is a fixed peg and is never
 * fetched — that is exactly why only the euro needs a day rate.
 *
 * No margin is applied: the owner asked for the plain ECB rate.
 */

export const runtime = 'nodejs'

const CURRENCIES = ['EUR'] as const

async function assertAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` and never
  // x-cron-secret; accept both so manual curls keep working too.
  if (secret) {
    if (req.headers.get('x-cron-secret') === secret) return true
    if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  }
  // Signed-in staff may also trigger it — the delivery screen does exactly that.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return ['admin', 'manager', 'sales', 'staff'].includes(profile?.role ?? '')
}

async function handle(req: NextRequest) {
  if (!await assertAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const asked = req.nextUrl.searchParams.get('date')
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? '') ? asked! : new Date().toISOString().slice(0, 10)

  const admin = createAdminClient()

  const { data: settings } = await admin
    .from('company_settings')
    .select('rate_usd')
    .limit(1)
    .single()
  const usdToXcg = Number(settings?.rate_usd) || 1.75

  const stored: Record<string, number> = {}
  const failed: Record<string, string> = {}

  for (const currency of CURRENCIES) {
    try {
      // On a weekend or holiday the ECB publishes nothing; frankfurter answers
      // with the previous publication day, which is the rate that applied.
      const res = await fetch(`https://api.frankfurter.app/${date}?from=${currency}&to=USD`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`rate source returned ${res.status}`)
      const body = await res.json()
      const toUsd = Number(body?.rates?.USD)
      if (!toUsd || !isFinite(toUsd)) throw new Error('no USD rate in response')

      const rateToXcg = Number((toUsd * usdToXcg).toFixed(6))

      // Key is (currency, rate_date): re-running the same day is a no-op update,
      // never a duplicate.
      const { error } = await admin.from('fx_rates').upsert({
        currency,
        rate_date: date,
        rate_to_xcg: rateToXcg,
        source: `ecb via frankfurter (${currency}->USD ${toUsd} x USD->XCG ${usdToXcg})`,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'currency,rate_date' })
      if (error) throw new Error(error.message)

      stored[currency] = rateToXcg
    } catch (err) {
      failed[currency] = err instanceof Error ? err.message : 'unknown error'
    }
  }

  return NextResponse.json({
    date,
    usd_to_xcg: usdToXcg,
    stored,
    ...(Object.keys(failed).length ? { failed } : {}),
  }, { status: Object.keys(failed).length && !Object.keys(stored).length ? 502 : 200 })
}

// Vercel Cron issues a GET; the delivery screen calls POST. Same work either way.
export const GET = handle
export const POST = handle
