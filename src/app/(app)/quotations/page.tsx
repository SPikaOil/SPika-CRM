'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { Plus, ReceiptText, FileText, Search, Trash2, Archive, Loader2, FileSpreadsheet } from 'lucide-react'
import { downloadCsv, csvDate, csvMoney } from '@/lib/csv-export'
import { useQuotes, useDeleteQuote, useConvertedQuoteIds } from '@/hooks/use-quotes'
import { useAuth } from '@/contexts/auth-context'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { Quote } from '@/types'

const statusColors: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
}

const FILTERS = ['all', 'draft', 'sent', 'accepted', 'declined', 'expired'] as const
type Filter = typeof FILTERS[number]

function displayStatusOf(quote: Quote) {
  const isExpired = (quote.status === 'draft' || quote.status === 'sent') &&
    quote.valid_until && new Date(quote.valid_until) < new Date()
  return isExpired ? 'expired' : quote.status
}

function QuotationsPageInner() {
  const { data: quotes, isLoading } = useQuotes()
  const { data: convertedIds } = useConvertedQuoteIds()
  const deleteQuote = useDeleteQuote()
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<Filter>((searchParams.get('status') as Filter) || 'all')
  const [search, setSearch] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Quote | null>(null)

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20 gap-3">
        <ReceiptText className="h-12 w-12 opacity-20" />
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    )
  }

  const searchLower = search.toLowerCase().trim()
  const all = quotes ?? []

  // A quote that already produced an order lives in the archive
  const isArchived = (q: Quote) => convertedIds?.has(q.id) ?? false

  const matches = (q: Quote) => {
    if (filter !== 'all' && displayStatusOf(q) !== filter) return false
    if (!searchLower) return true
    return (
      (q.quote_number ?? '').toLowerCase().includes(searchLower) ||
      ((q as any).customer?.company_name ?? '').toLowerCase().includes(searchLower)
    )
  }

  const activeQuotes = all.filter(q => !isArchived(q)).filter(matches)
  const archivedQuotes = all.filter(isArchived).filter(matches)

  // CSV of the quotations currently listed (active + archived), search applies
  function exportCsv() {
    const rows = [...activeQuotes, ...archivedQuotes]
    downloadCsv(
      'quotations',
      ['Quote #', 'PO #', 'Customer', 'Status', 'Archived', 'Subtotal', 'Tax', 'Total', 'Valid until', 'Created', 'Items'],
      rows.map(q => [
        q.quote_number,
        (q as any).po_number ?? '',
        q.customer?.company_name ?? '',
        q.status,
        isArchived(q) ? 'yes' : 'no',
        csvMoney(q.subtotal), csvMoney(q.tax), csvMoney(q.total),
        q.valid_until ?? '',
        csvDate(q.created_at),
        ((q.items ?? []) as any[]).filter(i => i.qty > 0).map(i => `${i.qty}x ${i.sku}`).join('; '),
      ])
    )
  }

  function QuoteRow({ quote }: { quote: Quote }) {
    const customer = (quote as any).customer
    const status = displayStatusOf(quote)
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card hover:bg-accent transition-colors">
        <Link href={`/quotations/${quote.id}`} className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-0.5 leading-tight">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{quote.quote_number || '—'}</p>
              <Badge className={`text-[11px] px-1.5 py-0 capitalize shrink-0 ${statusColors[status]}`}>{status}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {customer?.company_name ?? '—'}
              {quote.valid_until && ` · valid until ${new Date(quote.valid_until).toLocaleDateString('en', { day: 'numeric', month: 'short' })}`}
            </p>
          </div>
          <span className="text-sm font-medium shrink-0">XCG {Number(quote.total ?? 0).toFixed(2)}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mr-1 shrink-0 text-muted-foreground hover:text-red-600"
          onClick={() => setConfirmDelete(quote)}
          title="Delete quotation"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Quotations</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="px-2" title="Export CSV"
            disabled={!activeQuotes.length && !archivedQuotes.length} onClick={exportCsv}>
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Link href="/quotations/new">
            <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4" />
              New Quotation
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by quote number or customer name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-xs capitalize border transition-colors ${
              filter === f ? 'bg-red-600 text-white border-red-600' : 'bg-background hover:bg-muted border-input'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ReceiptText className="h-10 w-10 opacity-20" />
          <p className="font-medium">No quotations yet</p>
          <p className="text-sm">Create a quotation to send to a customer before they order</p>
          <Link href="/quotations/new">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 mt-1">New Quotation</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {activeQuotes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No quotations match this filter.</p>
            ) : (
              activeQuotes.map(q => <QuoteRow key={q.id} quote={q} />)
            )}
          </div>

          {/* Archive — quotes that were converted into an order */}
          {archivedQuotes.length > 0 && (
            <div className="pt-1">
              <button
                onClick={() => setShowArchive(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive ({archivedQuotes.length}) · converted to order
                <span className="text-[10px]">{showArchive ? '▲' : '▼'}</span>
              </button>
              {showArchive && (
                <div className="space-y-1.5 mt-2 opacity-70">
                  {archivedQuotes.map(q => <QuoteRow key={q.id} quote={q} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-background rounded-xl border shadow-lg p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold flex items-center gap-2"><Trash2 className="h-4 w-4 text-red-600" /> Delete quotation?</p>
            <p className="text-sm text-muted-foreground">
              {confirmDelete.quote_number || 'This quotation'} will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={deleteQuote.isPending}
                onClick={async () => { await deleteQuote.mutateAsync(confirmDelete.id); setConfirmDelete(null) }}
              >
                {deleteQuote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuotationsPage() {
  return (
    <Suspense>
      <QuotationsPageInner />
    </Suspense>
  )
}
