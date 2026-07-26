import JSZip from 'jszip'
import { SupabaseClient } from '@supabase/supabase-js'
import { toCsv, CsvValue } from '@/lib/csv-export'

/**
 * A complete backup of the CRM — every table, every row, every column, as a zip
 * of CSVs.
 *
 * Deliberately NOT filtered by period. A backup that only holds one month can
 * restore nothing: 25 of the 26 customers were created in some other month and
 * would simply be missing. Each monthly backup is a full photograph of the
 * database at that moment.
 *
 * Tables are discovered at runtime from the PostgREST schema rather than listed
 * here. A hard-coded list silently stops covering whatever gets added later,
 * and a backup you believe in but that misses a table is worse than none.
 */

// Views are derived data — restoring them means re-running their definition,
// not re-importing rows. The migrations hold that.
const EXCLUDED = new Set(['orders_with_sales_date', 'v_dashboard_kpis'])

const PAGE = 1000

/**
 * Cells longer than this are moved to _large_values.csv with a pointer left
 * behind. Nothing is lost — the value is still in the backup, just not wedged
 * into a spreadsheet cell.
 *
 * Why: orders.signature_data_url holds a base64 PNG of every signature, around
 * 40 kB per row. Left in place, orders.csv was 2.6 MB for 66 rows and could not
 * be opened as a spreadsheet. Splitting keeps the table workable AND complete.
 */
const MAX_CELL = 500

export interface BackupTable {
  name: string
  rows: number
  columns: number
}

export interface BackupResult {
  zip: Buffer
  tables: BackupTable[]
  totalRows: number
  skipped: { name: string; reason: string }[]
}

async function discoverTables(supabaseUrl: string, serviceKey: string): Promise<string[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) throw new Error(`Schema discovery failed: ${res.status}`)
  const spec = await res.json()
  // PostgREST 9-11 exposes `definitions`, 12+ exposes `components.schemas`.
  const names = Object.keys(spec.definitions ?? spec.components?.schemas ?? {})
  return names.filter(n => !EXCLUDED.has(n)).sort()
}

/** Every value ends up as a flat cell: objects and arrays become JSON text. */
function cell(v: unknown): CsvValue {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return v as CsvValue
}

async function fetchAll(admin: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from(table).select('*').range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
  }
  return out
}

export interface LargeValue {
  table: string
  rowId: string
  column: string
  chars: number
  value: string
}

function tableToCsv(
  table: string,
  rows: Record<string, unknown>[],
  large: LargeValue[]
): { csv: string; columns: number } {
  if (rows.length === 0) return { csv: '', columns: 0 }
  // Union of keys: a nullable column can be absent from the first row.
  const headers: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k)

  const body = rows.map(r =>
    headers.map(h => {
      const v = cell(r[h])
      const str = String(v ?? '')
      if (str.length <= MAX_CELL) return v
      const rowId = String(r.id ?? r.order_number ?? '(no id)')
      large.push({ table, rowId, column: h, chars: str.length, value: str })
      return `[${str.length} chars moved to _large_values.csv — ${table}/${rowId}/${h}]`
    })
  )
  return { csv: '﻿' + toCsv(headers, body), columns: headers.length }
}

/**
 * The JSON columns hold the data people actually want to work with, buried in a
 * single cell. These derived files unpack them into real tables — the raw
 * columns stay in place so the backup is still complete for restoring.
 */
function derivedFiles(byTable: Map<string, Record<string, unknown>[]>) {
  const files: { name: string; csv: string; rows: number }[] = []

  const orders = byTable.get('orders') ?? []
  const customers = byTable.get('customers') ?? []
  const nameById = new Map(customers.map(c => [c.id as string, (c.company_name as string) ?? '']))

  const lines: CsvValue[][] = []
  for (const o of orders) {
    for (const i of ((o.items ?? []) as Record<string, unknown>[])) {
      lines.push([
        o.order_number as CsvValue, o.id as CsvValue, o.status as CsvValue,
        o.invoice_date as CsvValue, o.planned_date as CsvValue,
        nameById.get(o.customer_id as string) ?? '', o.customer_id as CsvValue,
        i.sku as CsvValue, i.name as CsvValue, i.qty as CsvValue,
        i.unit_price as CsvValue, i.discount as CsvValue, i.line_total as CsvValue,
        i.tht_date as CsvValue, o.total as CsvValue, o.deleted_at ? 'yes' : 'no',
      ])
    }
  }
  files.push({
    name: 'derived_order_lines.csv',
    csv: '﻿' + toCsv(
      ['order_number', 'order_id', 'status', 'invoice_date', 'planned_date', 'customer', 'customer_id',
       'sku', 'product', 'qty', 'unit_price', 'discount', 'line_total', 'tht_date', 'order_total', 'deleted'],
      lines
    ),
    rows: lines.length,
  })

  const contacts: CsvValue[][] = []
  for (const c of customers) {
    for (const e of ((c.contact_log ?? []) as Record<string, unknown>[])) {
      contacts.push([
        c.company_name as CsvValue, c.id as CsvValue, c.is_lead ? 'lead' : 'customer',
        e.contacted_at as CsvValue, e.channel as CsvValue, e.contacted_by as CsvValue,
        e.note as CsvValue, e.logged_by as CsvValue, e.created_at as CsvValue,
      ])
    }
  }
  contacts.sort((a, b) => String(a[3]).localeCompare(String(b[3])))
  files.push({
    name: 'derived_contact_log.csv',
    csv: '﻿' + toCsv(
      ['company', 'customer_id', 'type', 'contacted_at', 'channel', 'contacted_by', 'note', 'logged_by', 'recorded_at'],
      contacts
    ),
    rows: contacts.length,
  })

  const edits: CsvValue[][] = []
  for (const o of orders) {
    for (const e of ((o.edit_log ?? []) as Record<string, unknown>[])) {
      edits.push([
        o.order_number as CsvValue, o.id as CsvValue, e.edited_at as CsvValue,
        e.edited_by as CsvValue, e.reason as CsvValue,
        e.old_total as CsvValue, e.new_total as CsvValue,
      ])
    }
  }
  files.push({
    name: 'derived_order_edits.csv',
    csv: '﻿' + toCsv(
      ['order_number', 'order_id', 'edited_at', 'edited_by', 'reason', 'old_total', 'new_total'],
      edits
    ),
    rows: edits.length,
  })

  return files
}

export async function buildFullBackup(
  admin: SupabaseClient,
  opts: { supabaseUrl: string; serviceKey: string; stamp: string; generatedBy?: string }
): Promise<BackupResult> {
  const tableNames = await discoverTables(opts.supabaseUrl, opts.serviceKey)
  const zip = new JSZip()
  const folder = zip.folder(opts.stamp)!

  const tables: BackupTable[] = []
  const skipped: { name: string; reason: string }[] = []
  const byTable = new Map<string, Record<string, unknown>[]>()
  const large: LargeValue[] = []
  let totalRows = 0

  for (const name of tableNames) {
    try {
      const rows = await fetchAll(admin, name)
      byTable.set(name, rows)
      const { csv, columns } = tableToCsv(name, rows, large)
      // An empty table still gets a file — its absence would look like a bug.
      folder.file(`${name}.csv`, csv || '﻿(no rows)')
      tables.push({ name, rows: rows.length, columns })
      totalRows += rows.length
    } catch (err) {
      skipped.push({ name, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  for (const d of derivedFiles(byTable)) {
    folder.file(d.name, d.csv)
    tables.push({ name: d.name.replace('.csv', ''), rows: d.rows, columns: 0 })
  }

  if (large.length) {
    folder.file(
      '_large_values.csv',
      '﻿' + toCsv(
        ['table', 'row_id', 'column', 'chars', 'value'],
        large.map(l => [l.table, l.rowId, l.column, l.chars, l.value])
      )
    )
    tables.push({ name: '_large_values', rows: large.length, columns: 5 })
  }

  const manifest = [
    'SPika CRM — complete backup',
    '',
    `Snapshot taken: ${new Date().toISOString()}`,
    `Requested by:   ${opts.generatedBy ?? 'SPika CRM'}`,
    `Period label:   ${opts.stamp}`,
    '',
    'This is the ENTIRE database at the moment above, not one month of it.',
    'Deleted orders are included — they are still data.',
    'JSON columns (orders.items, customers.contact_log, orders.edit_log) are kept',
    'as-is in the table files and additionally unpacked into the derived_* files.',
    ...(large.length
      ? ['',
         `${large.length} cell(s) longer than ${MAX_CELL} characters were moved to`,
         '_large_values.csv, with a pointer left in the original cell. This is what',
         'keeps orders.csv openable as a spreadsheet: the signature images are',
         'base64 and run to tens of kilobytes each. Nothing was dropped.']
      : []),
    '',
    'Contents:',
    ...tables.map(t => `  ${t.name.padEnd(30)} ${String(t.rows).padStart(6)} rows${t.columns ? ` · ${t.columns} columns` : ''}`),
    '',
    `Total rows: ${totalRows}`,
    ...(skipped.length
      ? ['', 'NOT INCLUDED — these failed and the backup is incomplete without them:',
         ...skipped.map(s => `  ${s.name}: ${s.reason}`)]
      : ['', 'All tables exported successfully.']),
    '',
    'This file contains customer contact details, pricing agreements, internal',
    'notes and team member data. Treat it as confidential.',
  ].join('\n')
  folder.file('_MANIFEST.txt', manifest)

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { zip: buf, tables, totalRows, skipped }
}
