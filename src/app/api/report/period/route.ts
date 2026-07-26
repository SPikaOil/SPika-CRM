import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { buildPeriodSnapshot, periodFileLabel } from '@/lib/report-snapshot'
import { buildWorkbook, buildCsv } from '@/lib/report-exports'
import { buildFullBackup } from '@/lib/full-backup'

/**
 * The full CRM report for a period, in three shapes off one snapshot.
 *
 *   GET  ?format=pdf|xlsx|csv&from=&to=   → the file itself (download button)
 *   POST                                  → renders all three, stores them, returns a summary
 *
 * Called by the Vercel cron on the 1st of the month with no dates, it reports
 * the month that just finished.
 *
 * @react-pdf needs a real Node runtime, not the edge one.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'pod-files'
const FOLDER = 'reports'

async function assertAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Two cron shapes: our own header (manual curl, external schedulers) and the
  // Authorization: Bearer that Vercel Cron sends by itself. Vercel does NOT
  // send x-cron-secret, so accepting only that would 403 every scheduled run.
  if (secret) {
    if (req.headers.get('x-cron-secret') === secret) return { ok: true, who: 'Scheduled job' }
    if (req.headers.get('authorization') === `Bearer ${secret}`) return { ok: true, who: 'Scheduled job' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, who: '' }
  const { data: profile } = await supabase.from('users').select('role, name').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false, who: '' }
  return { ok: true, who: profile?.name || user.email || 'Admin' }
}

/** Defaults to the month that just finished — what the 1st-of-month cron wants. */
function resolvePeriod(params: URLSearchParams | Record<string, unknown>) {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : (params[k] as string | undefined) ?? null

  const from = get('from')
  const to = get('to')
  if (from && to) return { from, to }

  const now = new Date()
  let year = Number(get('year'))
  let month = Number(get('month'))
  if (!year || !month) {
    year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    month = now.getMonth() === 0 ? 12 : now.getMonth()
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` }
}

async function renderPdf(snapshot: Awaited<ReturnType<typeof buildPeriodSnapshot>>, origin: string) {
  const [{ renderToBuffer }, React, { PeriodReportPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('@/components/pdf/period-report-pdf'),
  ])
  // The banner is fetched over HTTP by the renderer. If it ever fails the
  // report still has to come out, so the component treats it as optional.
  const element = React.createElement(PeriodReportPDF as never, {
    snapshot,
    bannerSrc: `${origin}/spika-banner.png`,
  } as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any)
}

/** The complete-database backup. Needs the service key for schema discovery. */
async function makeBackup(stamp: string, who: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return buildFullBackup(createAdminClient(), {
    supabaseUrl: url,
    serviceKey: key,
    stamp,
    generatedBy: who,
  })
}

export async function GET(req: NextRequest) {
  const auth = await assertAuthorized(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const params = req.nextUrl.searchParams
  // Vercel Cron always issues a GET, so ?store=1 is how the scheduled run asks
  // for the render-and-store path instead of a one-off download.
  if (params.get('store')) return POST(req)

  const format = (params.get('format') ?? 'pdf').toLowerCase()
  const { from, to } = resolvePeriod(params)

  const admin = createAdminClient()
  const snapshot = await buildPeriodSnapshot(admin, { from, to, generatedBy: auth.who })
  const stamp = periodFileLabel(from)

  if (format === 'xlsx') {
    const buf = buildWorkbook(snapshot)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${stamp} CRM Data.xlsx"`,
      },
    })
  }

  if (format === 'csv') {
    return new NextResponse(buildCsv(snapshot), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${stamp} CRM Data.csv"`,
      },
    })
  }

  if (format === 'backup') {
    const backup = await makeBackup(stamp, auth.who)
    return new NextResponse(new Uint8Array(backup.zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${stamp} Monthly Data.zip"`,
      },
    })
  }

  if (format === 'json') {
    return NextResponse.json(snapshot)
  }

  const pdf = await renderPdf(snapshot, req.nextUrl.origin)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${stamp} CRM Report.pdf"`,
    },
  })
}

/**
 * Renders all three and stores them. The stored copies are what the monthly
 * Drive backup picks up, and they stay in the app as the fallback if that
 * ever fails.
 */
export async function POST(req: NextRequest) {
  const auth = await assertAuthorized(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { from, to } = resolvePeriod({ ...body, ...Object.fromEntries(req.nextUrl.searchParams) })

  const admin = createAdminClient()
  const snapshot = await buildPeriodSnapshot(admin, { from, to, generatedBy: auth.who })
  const stamp = periodFileLabel(from)

  const backup = await makeBackup(stamp, auth.who)

  const files: { name: string; body: Uint8Array | string; type: string }[] = [
    { name: `${stamp} CRM Report.pdf`, body: new Uint8Array(await renderPdf(snapshot, req.nextUrl.origin)), type: 'application/pdf' },
    { name: `${stamp} CRM Data.xlsx`, body: new Uint8Array(buildWorkbook(snapshot)), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: `${stamp} CRM Data.csv`, body: buildCsv(snapshot), type: 'text/csv; charset=utf-8' },
    { name: `${stamp} Monthly Data.zip`, body: new Uint8Array(backup.zip), type: 'application/zip' },
  ]

  const stored: { name: string; path: string }[] = []
  for (const f of files) {
    const path = `${FOLDER}/${f.name}`
    const { error } = await admin.storage.from(BUCKET).upload(path, f.body, {
      upsert: true,
      contentType: f.type,
    })
    if (error) {
      console.error('[report/period] upload failed', f.name, error)
      return NextResponse.json({ error: `Storing ${f.name} failed: ${error.message}` }, { status: 500 })
    }
    stored.push({ name: f.name, path })
  }

  return NextResponse.json({
    ok: true,
    period: { from, to, label: snapshot.meta.label, stamp },
    bucket: BUCKET,
    files: stored,
    summary: {
      revenue: snapshot.kpis.revenue,
      orders: snapshot.kpis.ordersTotal,
      bottles: snapshot.kpis.bottles,
      customers: snapshot.kpis.customersOrdering,
      reconciles: snapshot.reconciliation.ties,
    },
    backup: {
      tables: backup.tables.length,
      rows: backup.totalRows,
      // Never silently ship an incomplete backup — surface what failed.
      incomplete: backup.skipped,
    },
  })
}
