'use client'

import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import { useQuotes } from '@/hooks/use-quotes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Quote, QuoteStatus } from '@/types'

const statusColors: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

export default function QuotesPage() {
  const { data: quotes, isLoading } = useQuotes()

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="text-muted-foreground text-sm">{quotes?.length ?? 0} total</p>
        </div>
        <Link href="/quotes/new">
          <Button className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : quotes?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <FileText className="h-12 w-12 opacity-20" />
          <p className="font-medium">No quotes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes?.map((quote) => (
            <Link
              key={quote.id}
              href={`/quotes/${quote.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono text-sm font-medium">{quote.quote_number}</p>
                  <Badge className={`text-xs capitalize ${statusColors[quote.status]}`}>{quote.status}</Badge>
                </div>
                <p className="font-medium mt-0.5">{quote.customer?.company_name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(quote.created_at).toLocaleDateString()}
                  {quote.valid_until && ` · Valid until ${new Date(quote.valid_until).toLocaleDateString()}`}
                </p>
              </div>
              <p className="font-semibold shrink-0">€{Number(quote.total).toFixed(2)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
