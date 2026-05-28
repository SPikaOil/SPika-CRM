'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { PackageCheck, Plus, Search } from 'lucide-react'
import { useExports } from '@/hooks/use-exports'
import { useAuth } from '@/contexts/auth-context'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ExportStatus } from '@/types'

const statusColors: Record<ExportStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  ready:     'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700',
  cleared:   'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

const statusLabels: Record<ExportStatus, string> = {
  draft:     'Draft',
  ready:     'Ready',
  submitted: 'Submitted',
  cleared:   'Cleared',
  delivered: 'Delivered',
}

const ALL_STATUSES: ExportStatus[] = ['draft', 'ready', 'submitted', 'cleared', 'delivered']

function ExportsPageInner() {
  const { data: exports, isLoading } = useExports()
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20 gap-3">
        <PackageCheck className="h-12 w-12 opacity-20" />
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
  const filtered = (statusFilter
    ? (exports ?? []).filter(e => e.status === statusFilter)
    : (exports ?? [])
  ).filter(e => {
    if (!searchLower) return true
    const customer = (e as any).order?.customer ?? (e as any).customer
    return (
      (e.export_number ?? '').toLowerCase().includes(searchLower) ||
      (customer?.company_name ?? '').toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exports</h1>
        <Link href="/exports/new">
          <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4" />
            New Export
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by export number or customer name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <Link href="/exports">
          <Button variant={!statusFilter ? 'default' : 'outline'} size="sm"
            className={!statusFilter ? 'bg-red-600 hover:bg-red-700' : ''}>
            All
          </Button>
        </Link>
        {ALL_STATUSES.map(s => (
          <Link key={s} href={`/exports?status=${s}`}>
            <Button variant={statusFilter === s ? 'default' : 'outline'} size="sm"
              className={statusFilter === s ? 'bg-red-600 hover:bg-red-700' : ''}>
              {statusLabels[s]}
            </Button>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <PackageCheck className="h-10 w-10 opacity-20" />
          <p className="font-medium">No exports yet</p>
          <p className="text-sm">Create an export to generate customs documents</p>
          <Link href="/exports/new">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 mt-1">New Export</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => {
            const order = (exp as any).order
            const customer = order?.customer ?? (exp as any).customer
            return (
              <Link key={exp.id} href={`/exports/${exp.id}`}>
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors">
                  <PackageCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-medium text-sm font-mono">{exp.export_number || '—'}</p>
                      <Badge className={`text-xs capitalize ${statusColors[exp.status]}`}>
                        {statusLabels[exp.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {customer?.company_name ?? '—'}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{exp.destination || '—'}</span>
                      {exp.export_date && (
                        <span>·{' '}
                          {new Date(exp.export_date + 'T12:00:00').toLocaleDateString('en', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                      )}
                      {(exp as any).carrier && (
                        <span className="ml-auto">{(exp as any).carrier.name}</span>
                      )}
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

export default function ExportsPage() {
  return (
    <Suspense>
      <ExportsPageInner />
    </Suspense>
  )
}
