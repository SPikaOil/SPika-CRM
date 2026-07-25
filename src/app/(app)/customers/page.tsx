'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Building2, Upload, Download, FileDown, X, CheckCircle, AlertCircle, MinusCircle } from 'lucide-react'
import { useCustomers } from '@/hooks/use-customers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CustomerCategory } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { customerCountryCode } from '@/lib/country'

type ImportRow = {
  company_name: string
  contact_person?: string
  email?: string
  phone?: string
  whatsapp?: string
  customer_category?: string
  coc_number?: string
  vat_number?: string
  street?: string
  city?: string
  country?: string
  notes?: string
  [key: string]: string | undefined
}

type ImportResult = { row: ImportRow; error?: string; skipped?: boolean; existingId?: string }

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: any = {}
    headers.forEach((h, i) => { if (values[i]) row[h] = values[i] })
    return row as ImportRow
  }).filter(r => r.company_name)
}

const categoryColors: Record<CustomerCategory, string> = {
  wholesale:   'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  horeca:      'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  supermarket: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  shops:       'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  dtf:         'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  other:       'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  b2c:         'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  export:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
}

const VALID_CATEGORIES = ['wholesale', 'horeca', 'supermarket', 'shops', 'dtf', 'other', 'b2c', 'export']

const PRICE_COLUMNS = SPIKA_PRODUCTS.map(p => `price_${p.sku.replace(/-/g, '_')}`)

const CSV_HEADERS = [
  'company_name',
  'contact_person',
  'email',
  'phone',
  'whatsapp',
  'customer_category',
  'coc_number',
  'vat_number',
  'street',
  'city',
  'country',
  'notes',
  ...PRICE_COLUMNS,
]

function downloadXLSX(rows: any[][], filename: string) {
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, filename)
  })
}

function exportCustomersXML(customers: any[]) {
  const headers = CSV_HEADERS
  const dataRows = customers.map(c => {
    const prices = SPIKA_PRODUCTS.map(p => {
      const val = c.product_prices?.[p.sku]
      return val != null ? Number(val) : ''
    })
    return [
      c.company_name ?? '',
      c.contact_person ?? '',
      c.email ?? '',
      c.phone ?? '',
      c.whatsapp ?? '',
      c.customer_category ?? '',
      c.coc_number ?? '',
      c.vat_number ?? '',
      c.billing_address?.street ?? '',
      c.billing_address?.city ?? '',
      c.billing_address?.country ?? '',
      c.internal_notes ?? '',
      ...prices,
    ]
  })
  downloadXLSX([headers, ...dataRows], `spika-customers-${new Date().toISOString().split('T')[0]}.xlsx`)
}

function downloadTemplateXML() {
  const headers = CSV_HEADERS
  const examplePrices = SPIKA_PRODUCTS.map(p => p.default_price)
  const example = [
    'Example Company', 'John Doe', 'john@example.com', '+5999 000 0000', '',
    'horeca', '145141', '', 'Kaya Kiwa 31', 'Willemstad', 'CW', '',
    ...examplePrices,
  ]
  downloadXLSX([headers, example], 'spika-customers-template.xlsx')
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [country, setCountry] = useState('all')
  const { data: customers, isLoading } = useCustomers(search, category)

  // Country filter is applied client-side on normalized country codes
  const countryCodes = Array.from(
    new Set((customers ?? []).map(c => customerCountryCode(c)).filter(Boolean))
  ).sort() as string[]
  const visibleCustomers = (customers ?? []).filter(
    c => country === 'all' || customerCountryCode(c) === country
  )
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null)

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResults(null)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length === 0) { toast.error('No valid rows found. Make sure the CSV has a header row and a company_name column.'); return }

      const supabase = createClient()
      const results: ImportResult[] = []
      for (const row of rows) {
        // Skip if a customer with the same name already exists
        const existing = (customers ?? []).find(c =>
          c.company_name.toLowerCase().trim() === row.company_name.toLowerCase().trim()
        )
        if (existing) {
          results.push({ row, skipped: true, existingId: existing.id })
          continue
        }

        try {
          const cat = VALID_CATEGORIES.includes(row.customer_category ?? '') ? row.customer_category : 'other'
          const billing_address = (row.street || row.city) ? { street: row.street ?? '', city: row.city ?? '', country: row.country ?? '' } : undefined
          const product_prices: Record<string, number> = {}
          SPIKA_PRODUCTS.forEach(p => {
            const col = `price_${p.sku.replace(/-/g, '_')}`
            const val = row[col]
            if (val && !isNaN(Number(val))) product_prices[p.sku] = Number(val)
          })
          const { error } = await supabase.from('customers').insert({
            company_name: row.company_name,
            contact_person: row.contact_person ?? '',
            email: row.email ?? '',
            phone: row.phone ?? '',
            whatsapp: row.whatsapp ?? '',
            customer_category: cat,
            coc_number: row.coc_number ?? '',
            vat_number: row.vat_number ?? '',
            notes: row.notes ?? '',
            ...(Object.keys(product_prices).length > 0 ? { product_prices } : {}),
            ...(billing_address ? { billing_address } : {}),
            status: 'active',
          })
          results.push({ row, error: error?.message })
        } catch (err: any) {
          results.push({ row, error: err.message })
        }
      }
      setImportResults(results)
      const ok = results.filter(r => !r.error && !r.skipped).length
      const skipped = results.filter(r => r.skipped).length
      const fail = results.filter(r => r.error).length
      if (ok > 0) { toast.success(`Imported ${ok} customer${ok > 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} already existed` : ''}${fail > 0 ? `, ${fail} failed` : ''}`) }
      else if (skipped > 0 && fail === 0) { toast.info(`All ${skipped} customers already exist — nothing imported`) }
      else { toast.error(`All ${fail} rows failed to import`) }
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to parse CSV')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">
            {customers?.length ?? 0} total
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={downloadTemplateXML} title="Download template">
              <FileDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => customers && exportCustomersXML(customers)}
              disabled={!customers?.length} title="Export Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}
              disabled={importing} title="Import CSV">
              <Upload className="h-4 w-4" />
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVImport} />
            <Link href="/customers/new">
              <Button className="bg-red-600 hover:bg-red-700">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Import results */}
      {importResults && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Import Results</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setImportResults(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {importResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {r.error
                  ? <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                  : r.skipped
                  ? <MinusCircle className="h-3 w-3 text-orange-400 shrink-0" />
                  : <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                }
                <span className="font-medium truncate">{r.row.company_name}</span>
                {r.skipped && (
                  <a href={`/customers/${r.existingId}`} className="text-orange-500 hover:underline truncate">
                    already exists →
                  </a>
                )}
                {r.error && <span className="text-red-500 truncate">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {importResults.filter(r => !r.error && !r.skipped).length} imported ·{' '}
            {importResults.filter(r => r.skipped).length} skipped (already exist) ·{' '}
            {importResults.filter(r => r.error).length} failed
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="horeca">HORECA</SelectItem>
            <SelectItem value="dtf">DTF</SelectItem>
            <SelectItem value="other">Other</SelectItem>
            <SelectItem value="b2c">B2C</SelectItem>
          </SelectContent>
        </Select>
        <Select value={country} onValueChange={(v) => setCountry(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {countryCodes.map(code => (
              <SelectItem key={code} value={code}>{code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : visibleCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="font-medium">No customers found</p>
          <p className="text-sm">Add your first customer to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCustomers.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex items-center gap-3 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <span className="text-red-700 dark:text-red-300 font-semibold text-xs">
                  {customer.company_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{customer.company_name}</p>
                  {(customer as any).customer_number && (
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                      {(customer as any).customer_number}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 capitalize ${categoryColors[customer.customer_category]}`}
                  >
                    {customer.customer_category}
                  </Badge>
                  {customerCountryCode(customer) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground shrink-0">
                      {customerCountryCode(customer)}
                    </Badge>
                  )}
                  {customer.status === 'inactive' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                  {(customer.contact_person || customer.phone) && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {customer.contact_person}{customer.phone ? ` · ${customer.phone}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
