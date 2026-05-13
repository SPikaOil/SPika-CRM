'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Building2, Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
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

type ImportRow = {
  company_name: string
  contact_person?: string
  email?: string
  phone?: string
  whatsapp?: string
  customer_category?: string
  vat_number?: string
  street?: string
  city?: string
  country?: string
  notes?: string
}

type ImportResult = { row: ImportRow; error?: string }

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
  wholesale: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  horeca: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  dtf: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  b2c: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
}

const VALID_CATEGORIES = ['wholesale', 'horeca', 'dtf', 'other', 'b2c']

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const { data: customers, isLoading } = useCustomers(search, category)
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
        try {
          const cat = VALID_CATEGORIES.includes(row.customer_category ?? '') ? row.customer_category : 'other'
          const billing_address = (row.street || row.city) ? { street: row.street ?? '', city: row.city ?? '', country: row.country ?? '' } : undefined
          const { error } = await supabase.from('customers').insert({
            company_name: row.company_name,
            contact_person: row.contact_person ?? '',
            email: row.email ?? '',
            phone: row.phone ?? '',
            whatsapp: row.whatsapp ?? '',
            customer_category: cat,
            vat_number: row.vat_number ?? '',
            notes: row.notes ?? '',
            ...(billing_address ? { billing_address } : {}),
            status: 'active',
          })
          results.push({ row, error: error?.message })
        } catch (err: any) {
          results.push({ row, error: err.message })
        }
      }
      setImportResults(results)
      const ok = results.filter(r => !r.error).length
      const fail = results.filter(r => r.error).length
      if (ok > 0) { toast.success(`Imported ${ok} customer${ok > 1 ? 's' : ''}${fail > 0 ? `, ${fail} failed` : ''}`) }
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">
            {customers?.length ?? 0} total
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Importing…' : 'Import CSV'}
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
                  : <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                }
                <span className="font-medium truncate">{r.row.company_name}</span>
                {r.error && <span className="text-red-500 truncate">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {importResults.filter(r => !r.error).length} succeeded · {importResults.filter(r => r.error).length} failed
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? 'all')}>
          <SelectTrigger className="w-36">
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
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : customers?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="font-medium">No customers found</p>
          <p className="text-sm">Add your first customer to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers?.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <span className="text-red-700 dark:text-red-300 font-semibold text-sm">
                  {customer.company_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{customer.company_name}</p>
                  <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${categoryColors[customer.customer_category]}`}
                  >
                    {customer.customer_category}
                  </Badge>
                  {customer.status === 'inactive' && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {customer.contact_person}
                  {customer.phone && ` · ${customer.phone}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
