'use client'

import { useMemo, useState } from 'react'
import { Search, Store, MapPin, Sprout } from 'lucide-react'
import { useCustomerNames } from '@/hooks/use-customer-names'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The reseller list, for people who need to know WHO but not WHAT.
 *
 * Marketing has to aim material at named shops, and until now had no way to
 * even see their names — the customers table is closed to that role on purpose,
 * because it carries orders, the price agreement and the internal notes.
 *
 * This reads `customer_names` (migration 077): company, number, city, country,
 * lead or not, active or not. Nothing else exists in that view, so there is
 * nothing here to leak. Read-only by construction — there is no edit path,
 * because the view has no table under it to write to.
 */
export default function ResellersPage() {
  const { data: resellers, isLoading } = useCustomerNames()
  const [search, setSearch] = useState('')
  const [showLeads, setShowLeads] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (resellers ?? [])
      .filter(r => showLeads || !r.is_lead)
      .filter(r =>
        !q ||
        r.company_name.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.country ?? '').toLowerCase().includes(q) ||
        (r.customer_number ?? '').toLowerCase().includes(q),
      )
  }, [resellers, search, showLeads])

  const leadCount = (resellers ?? []).filter(r => r.is_lead).length

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Store className="h-5 w-5" />
            Resellers
          </h1>
          <p className="text-muted-foreground text-xs">
            Who sells SPika, and where. Names only — no orders, no prices, no turnover.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search a shop, a city, a country"
            className="pl-8"
          />
        </div>
        {leadCount > 0 && (
          <button
            onClick={() => setShowLeads(v => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              showLeads ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-950/30 dark:border-teal-900' : 'hover:bg-accent'
            }`}
          >
            <Sprout className="h-3 w-3 inline mr-1" />
            {showLeads ? 'Hiding nothing' : `Also show ${leadCount} leads`}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {search ? `Nothing matches "${search}".` : 'No resellers yet.'}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <CardContent className="p-0 divide-y">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{r.company_name}</p>
                  {(r.city || r.country) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[r.city, r.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                {r.is_lead && (
                  <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-700 shrink-0">
                    Lead
                  </Badge>
                )}
                {r.status === 'inactive' && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                    Inactive
                  </Badge>
                )}
                {r.customer_number && (
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {r.customer_number}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} shown{filtered.length !== (resellers ?? []).length && ` of ${(resellers ?? []).length}`}
      </p>
    </div>
  )
}
