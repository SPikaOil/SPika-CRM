import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function assertAuthorized(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  const authorized = await assertAuthorized(req)
  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const now = new Date()
  const year: number = body.year ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
  const month: number = body.month ?? (now.getMonth() === 0 ? 12 : now.getMonth())

  const start = new Date(year, month - 1, 1).toISOString()
  const end = new Date(year, month, 1).toISOString()
  const label = monthLabel(year, month)

  const [ordersRes, customersRes, newCustomersRes, accessRes] = await Promise.all([
    admin
      .from('orders')
      .select('id, order_number, total, status, payment_type, customer:customers(company_name, customer_category), items, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .is('deleted_at', null),
    admin.from('customers').select('id').eq('status', 'active'),
    admin.from('customers').select('id, company_name, customer_category').gte('created_at', start).lt('created_at', end),
    admin.from('access_requests').select('id, status, company_name, created_at').gte('created_at', start).lt('created_at', end),
  ])

  const orders = ordersRes.data ?? []
  const allCustomers = customersRes.data ?? []
  const newCustomers = newCustomersRes.data ?? []
  const accessRequests = accessRes.data ?? []

  const delivered = orders.filter(o => ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'].includes(o.status))
  const totalRevenue = delivered.reduce((s, o) => s + Number(o.total ?? 0), 0)
  const totalOrders = orders.length
  const deliveredCount = delivered.length
  const pendingCount = orders.filter(o => ['pending_approval', 'approved', 'out_for_delivery'].includes(o.status)).length

  const byCategory: Record<string, { count: number; revenue: number }> = {}
  for (const o of delivered) {
    const cat = (o.customer as any)?.customer_category ?? 'unknown'
    if (!byCategory[cat]) byCategory[cat] = { count: 0, revenue: 0 }
    byCategory[cat].count++
    byCategory[cat].revenue += Number(o.total ?? 0)
  }

  const byCustomer: Record<string, { name: string; count: number; revenue: number }> = {}
  for (const o of delivered) {
    const name = (o.customer as any)?.company_name ?? 'Unknown'
    if (!byCustomer[name]) byCustomer[name] = { name, count: 0, revenue: 0 }
    byCustomer[name].count++
    byCustomer[name].revenue += Number(o.total ?? 0)
  }
  const topCustomers = Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  const COUNTED_SKUS = ['oil-100ml', 'oil-50ml']
  let totalBottles = 0
  for (const o of delivered) {
    const items: { sku: string; qty: number }[] = (o.items as any) ?? []
    totalBottles += items.filter(i => COUNTED_SKUS.includes(i.sku)).reduce((s, i) => s + (i.qty ?? 0), 0)
  }

  const catRows = Object.entries(byCategory)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([cat, d]) => `<tr><td>${cat}</td><td style="text-align:center">${d.count}</td><td style="text-align:right">XCG ${fmt(d.revenue)}</td></tr>`).join('')

  const topRows = topCustomers.map(c =>
    `<tr><td>${c.name}</td><td style="text-align:center">${c.count}</td><td style="text-align:right">XCG ${fmt(c.revenue)}</td></tr>`).join('')

  const newCustRows = newCustomers.length
    ? newCustomers.map(c => `<tr><td>${c.company_name}</td><td>${c.customer_category ?? '—'}</td></tr>`).join('')
    : '<tr><td colspan="2" style="color:#888">No new customers this month</td></tr>'

  const accessRows = accessRequests.length
    ? accessRequests.map(r => `<tr><td>${r.company_name}</td><td>${r.status}</td><td>${new Date(r.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</td></tr>`).join('')
    : '<tr><td colspan="3" style="color:#888">No access requests this month</td></tr>'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Monthly Report — ${label}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 40px; }
    h1 { font-size: 24px; color: #c00; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 32px; }
    h2 { font-size: 15px; font-weight: 700; margin: 28px 0 10px; border-bottom: 2px solid #c00; padding-bottom: 4px; color: #c00; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 8px; }
    .kpi { background: #f8f8f8; border-radius: 8px; padding: 16px; border: 1px solid #e5e5e5; }
    .kpi .val { font-size: 26px; font-weight: 800; color: #c00; }
    .kpi .lbl { font-size: 11px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #f0f0f0; text-align: left; padding: 8px 10px; font-size: 11px; color: #555; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>SPika CRM — Monthly Report</h1>
  <p class="subtitle">Period: ${label} &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  <h2>Key Numbers</h2>
  <div class="kpis">
    <div class="kpi"><div class="val">XCG ${fmt(totalRevenue)}</div><div class="lbl">Total Revenue</div></div>
    <div class="kpi"><div class="val">${totalBottles}</div><div class="lbl">Bottles Sold</div></div>
    <div class="kpi"><div class="val">${totalOrders}</div><div class="lbl">Orders Placed</div></div>
    <div class="kpi"><div class="val">${allCustomers.length}</div><div class="lbl">Active Customers</div></div>
  </div>
  <div class="kpis" style="margin-top:8px">
    <div class="kpi"><div class="val">${deliveredCount}</div><div class="lbl">Orders Delivered</div></div>
    <div class="kpi"><div class="val">${pendingCount}</div><div class="lbl">Still Open</div></div>
    <div class="kpi"><div class="val">${newCustomers.length}</div><div class="lbl">New Customers</div></div>
    <div class="kpi"><div class="val">${accessRequests.length}</div><div class="lbl">Portal Requests</div></div>
  </div>
  <h2>Revenue by Category</h2>
  <table><thead><tr><th>Category</th><th style="text-align:center">Orders</th><th style="text-align:right">Revenue</th></tr></thead>
  <tbody>${catRows || '<tr><td colspan="3" style="color:#888">No data</td></tr>'}</tbody></table>
  <h2>Top 10 Customers</h2>
  <table><thead><tr><th>Customer</th><th style="text-align:center">Orders</th><th style="text-align:right">Revenue</th></tr></thead>
  <tbody>${topRows || '<tr><td colspan="3" style="color:#888">No data</td></tr>'}</tbody></table>
  <h2>New Customers This Month</h2>
  <table><thead><tr><th>Company</th><th>Category</th></tr></thead>
  <tbody>${newCustRows}</tbody></table>
  <h2>Portal Access Requests</h2>
  <table><thead><tr><th>Company</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>${accessRows}</tbody></table>
  <div class="footer">Auto-generated by SPika CRM &nbsp;·&nbsp; ${label} &nbsp;·&nbsp; Confidential</div>
</body>
</html>`

  // ── Store report URL pointing to our own serve endpoint ───────────────────
  // We store the report key in the DB; the file_url points to our API serve route.

  const reportKey = `${year}-${String(month).padStart(2, '0')}`
  const fileName = `monthly-report-${reportKey}.html`

  // Find or create "Monthly Reports" folder
  let folderId: string | null = null
  const { data: existingFolder } = await admin
    .from('sales_document_folders')
    .select('id')
    .eq('name', 'Monthly Reports')
    .maybeSingle()

  if (existingFolder) {
    folderId = existingFolder.id
  } else {
    const { data: newFolder } = await admin
      .from('sales_document_folders')
      .insert({ name: 'Monthly Reports' })
      .select('id')
      .single()
    folderId = newFolder?.id ?? null
  }

  // Store HTML content in a separate table column via description (base64-encoded)
  // We upsert the sales_documents record and use report_content column
  // First delete old record for same month
  await admin.from('sales_documents').delete().eq('file_name', fileName)

  // Store HTML as a data URI so it can be opened directly from the file_url field
  const base64 = Buffer.from(html, 'utf-8').toString('base64')
  const dataUrl = `data:text/html;base64,${base64}`

  const { error: insertError } = await admin.from('sales_documents').insert({
    name: `Monthly Report — ${label}`,
    description: `Auto-generated: ${totalOrders} orders · XCG ${fmt(totalRevenue)} revenue · ${totalBottles} bottles`,
    category: 'other',
    folder_id: folderId,
    file_url: dataUrl,
    file_name: fileName,
    file_size: html.length,
  })

  if (insertError) {
    console.error('[report] insert error', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, label, totalRevenue, totalOrders, totalBottles })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
