'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { Plus, ReceiptText, FileText, Search } from 'lucide-react'
import { useQuotes } from '@/hooks/use-quotes'
import { useAuth } from '@/contexts/auth-context'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const statusColors: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
}

function QuotationsPageInner() {
  const { data: quotes, isLoading } = useQuotes()
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')

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
      <div className="p-4 lg:p-6 space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    )
  }

  const searchLower = search.toLowerCase().trim()
  const visibleQuotes = (statusFilter ? (quotes ?? []).filter(q => q.status === statusFilter) : (quotes ?? []))
    .filter(q => {
      if (!searchLower) return true
      return (
        (q.quote_number ?? '').toLowerCase().includes(searchLower) ||
        ((q as any).customer?.company_name ?? '').toLowerCase().includes(searchLower)
      )
    })

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quotations</h1>
        <Link href="/quotations/new">
          <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4" />
            New Quotation
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by quote number or customer name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!quotes || quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ReceiptText className="h-10 w-10 opacity-20" />
          <p className="font-medium">No quotations yet</p>
          <p className="text-sm">Create a quotation to send to a customer before they order</p>
          <Link href="/quotations/new">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 mt-1">New Quotation</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {statusFilter && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
              <span>Showing: <span className="font-medium capitalize text-foreground">{statusFilter}</span></span>
              <Link href="/quotations" className="text-red-600 hover:underline text-xs">Clear filter</Link>
            </div>
          )}
          {visibleQuotes.map((quote) => {
            const customer = (quote as any).customer
            const isExpired = (quote.status === 'draft' || quote.status === 'sent') &&
              quote.valid_until && new Date(quote.valid_until) < new Date()
            const displayStatus = isExpired ? 'expired' : quote.status
            return (
              <Link key={quote.id} href={`/quotations/${quote.id}`}>
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-medium text-sm">{quote.quote_number || '—'}</p>
                      <Badge className={`text-xs capitalize ${statusColors[displayStatus]}`}>
                        {displayStatus}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{customer?.company_name ?? '—'}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {quote.valid_until && (
                        <span>
                          Valid until {new Date(quote.valid_until).toLocaleDateString('en', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                      )}
                      <span className="ml-auto font-medium text-foreground">
                        XCG {Number(quote.total ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
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
