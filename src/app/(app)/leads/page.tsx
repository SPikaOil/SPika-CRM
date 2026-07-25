'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sprout, Plus, Search, Building2, PhoneCall, FileSpreadsheet } from 'lucide-react'
import { downloadCsv, csvDate } from '@/lib/csv-export'
import { useCustomers } from '@/hooks/use-customers'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ContactLogEntry } from '@/types'

function lastContact(log: ContactLogEntry[] | undefined) {
  if (!log || log.length === 0) return null
  const latest = [...log].sort((a, b) => (b.contacted_at || '').localeCompare(a.contacted_at || ''))[0]
  return latest?.contacted_at ?? null
}

export default function LeadsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const { data: leads, isLoading } = useCustomers(search, undefined, { leadsOnly: true })

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  // CSV of the leads currently listed, with their contact history summarised
  function exportCsv() {
    downloadCsv(
      'leads',
      ['Company', 'Contact', 'Email', 'Phone', 'WhatsApp', 'Category', 'Country', 'City',
       'Contacts logged', 'Last contact', 'Last note', 'Notes'],
      (leads ?? []).map(l => {
        const log = ((l as any).contact_log ?? []) as any[]
        const latest = log.length
          ? [...log].sort((a, b) => (b.contacted_at || '').localeCompare(a.contacted_at || ''))[0]
          : null
        return [
          l.company_name, l.contact_person, l.email, l.phone, l.whatsapp,
          l.customer_category,
          (l.billing_address as any)?.country ?? '',
          (l.billing_address as any)?.city ?? '',
          log.length,
          latest?.contacted_at ? csvDate(latest.contacted_at) : '',
          latest?.note ?? '',
          l.internal_notes,
        ]
      })
    )
  }

  if (authLoading || !isAdmin) return null

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sprout className="h-6 w-6 text-teal-600" /> Leads
          </h1>
          <p className="text-muted-foreground text-sm">Potential customers — follow up and convert them</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title="Export CSV"
            disabled={!leads?.length} onClick={exportCsv}>
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Link href="/customers/new?lead=1">
            <Button className="bg-teal-600 hover:bg-teal-700 gap-1.5"><Plus className="h-4 w-4" /> New Lead</Button>
          </Link>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !leads || leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Sprout className="h-10 w-10 opacity-20" />
          <p className="font-medium">No leads yet</p>
          <p className="text-sm">Add a potential customer to start tracking follow-ups</p>
          <Link href="/customers/new?lead=1">
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 mt-1 gap-1.5"><Plus className="h-4 w-4" /> New Lead</Button>
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{leads.length} lead{leads.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {leads.map((lead) => {
              const last = lastContact((lead as any).contact_log)
              const daysAgo = last ? Math.floor((today.getTime() - new Date(last + 'T00:00:00').getTime()) / 86400000) : null
              return (
                <Link
                  key={lead.id}
                  href={`/customers/${lead.id}`}
                  className="flex items-center gap-3 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors"
                >
                  <div className="shrink-0 h-6 w-6 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center">
                    <Building2 className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lead.company_name}</p>
                    {(lead.contact_person || lead.phone) && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {lead.contact_person}{lead.phone ? ` · ${lead.phone}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {last ? (
                      <>
                        <p className="text-xs font-medium flex items-center gap-1 justify-end">
                          <PhoneCall className="h-3 w-3 text-muted-foreground" />
                          {daysAgo === 0 ? 'today' : `${daysAgo}d ago`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">last contact</p>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">no contact yet</Badge>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
