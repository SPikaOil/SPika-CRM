'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Mail, MailCheck, ShieldOff, RefreshCw, Globe, Clock, UserPlus, CheckCircle, XCircle, Inbox, Send, FileSpreadsheet } from 'lucide-react'
import { downloadCsv } from '@/lib/csv-export'
import { useAuth } from '@/contexts/auth-context'
import { useCustomers } from '@/hooks/use-customers'
import { createClient } from '@/lib/supabase/client'
import { Customer, AccessRequest } from '@/types'
import { customerCountryCode } from '@/lib/country'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

type PortalStatus = 'no_access' | 'invited' | 'active'

type CustomerWithPortal = Customer & {
  portalStatus: PortalStatus
  portalUserId?: string
}

function statusBadge(status: PortalStatus) {
  if (status === 'active') return <Badge className="bg-green-600 text-white">Active</Badge>
  if (status === 'invited') return <Badge className="bg-orange-500 text-white">Invited</Badge>
  return <Badge variant="outline" className="text-muted-foreground">No Access</Badge>
}

export default function PortalManagementPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { data: customers, isLoading: customersLoading } = useCustomers()
  const [portalUsers, setPortalUsers] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [loading, setLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'customers' | 'requests'>('customers')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  // Load access requests
  useEffect(() => {
    if (!isAdmin) return
    setRequestsLoading(true)
    supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // Hide accepted requests — customer is now active in the Customers tab
        setRequests(((data as AccessRequest[]) ?? []).filter(r => r.status !== 'accepted'))
        setRequestsLoading(false)
      })
  }, [isAdmin])

  // Load all portal users (role=customer) to determine per-customer status
  useEffect(() => {
    supabase
      .from('users')
      .select('id, customer_id')
      .eq('role', 'customer')
      .not('customer_id', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string> = {}
        for (const u of data) {
          if (u.customer_id) map[u.customer_id] = u.id
        }
        setPortalUsers(map)
      })
  }, [])

  function getStatus(customer: Customer): PortalStatus {
    if (!portalUsers[customer.id]) return 'no_access'
    return 'active'
  }

  const countryCode = (customer: Customer) => customerCountryCode(customer)

  async function handleInvite(customer: Customer) {
    if (!customer.email) {
      toast.error('This customer has no email address — add one first')
      return
    }
    setLoading(customer.id)
    try {
      const res = await fetch('/api/admin/portal-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.resent ? `Invite resent to ${customer.email}` : `Invite sent to ${customer.email}`)
      // Update local state
      setPortalUsers(prev => ({ ...prev, [customer.id]: 'pending' }))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function handleRevoke(customer: Customer) {
    if (!confirm(`Remove portal access for ${customer.company_name}? They will no longer be able to log in.`)) return
    setLoading(customer.id)
    try {
      const res = await fetch('/api/admin/portal-invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Portal access revoked for ${customer.company_name}`)
      setPortalUsers(prev => {
        const next = { ...prev }
        delete next[customer.id]
        return next
      })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function handleResend(requestId: string) {
    setLoading(requestId)
    try {
      const res = await fetch(`/api/admin/access-requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Invite email resent')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function handleSendAccess(requestId: string) {
    setLoading(requestId)
    try {
      const res = await fetch(`/api/admin/access-requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_access' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Portal access sent — customer can now log in')
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved' } : r))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function handleReview(requestId: string, action: 'approve' | 'deny') {
    setLoading(requestId)
    try {
      const res = await fetch(`/api/admin/access-requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'approve') {
        const req = requests.find(r => r.id === requestId)
        if (req?.user_id) {
          toast.success('Customer created — set prices in CRM, then click Send Access')
          setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved_pending_setup' } : r))
        } else {
          toast.success('Invite sent — awaiting customer sign-up')
          setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'link_sent' } : r))
        }
      } else {
        toast.success('Request denied')
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'denied' } : r))
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(null)
    }
  }

  const pendingCount = requests.filter(r => ['pending', 'link_sent', 'approved_pending_setup'].includes(r.status)).length

  const activeCustomers = (customers ?? []).filter(c => c.status === 'active')
  const availableCountries = Array.from(
    new Set(activeCustomers.map(c => customerCountryCode(c)).filter(Boolean))
  ).sort() as string[]

  const filtered = activeCustomers
    .filter(c =>
      !search ||
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    )
    .filter(c => categoryFilter === 'all' || c.customer_category === categoryFilter)
    .filter(c => countryFilter === 'all' || customerCountryCode(c) === countryFilter)

  const activeCount = filtered.filter(c => portalUsers[c.id]).length
  const noAccessCount = filtered.filter(c => !portalUsers[c.id]).length

  if (authLoading || customersLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-red-600" />
            Customer Portal
          </h1>
          <p className="text-muted-foreground text-sm">
            {activeCount} with access · {noAccessCount} without access
          </p>
        </div>
        <Button variant="outline" size="icon" title="Export CSV"
          disabled={!filtered.length}
          onClick={() => downloadCsv(
            'portal-access',
            ['Company', 'Contact', 'Email', 'Category', 'Country', 'Portal access', 'Portal user'],
            filtered.map(c => [
              c.company_name, c.contact_person, c.email, c.customer_category,
              customerCountryCode(c) ?? '',
              portalUsers[c.id] ? 'yes' : 'no',
              portalUsers[c.id] ?? '',
            ])
          )}>
          <FileSpreadsheet className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted w-fit">
        <button
          onClick={() => setTab('customers')}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === 'customers' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Customers
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tab === 'requests' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Access Requests
          {pendingCount > 0 && (
            <span className="bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{pendingCount}</span>
          )}
        </button>
      </div>

      {/* Access Requests tab */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {requestsLoading && <div className="h-16 rounded-xl bg-muted animate-pulse" />}
          {!requestsLoading && requests.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No access requests yet</p>
            </div>
          )}
          {requests.map(req => (
            <Card key={req.id} className="py-0">
              <CardContent className="py-2.5 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{req.company_name}</p>
                      {req.status === 'pending' && <Badge className="bg-orange-500 text-white text-xs">Pending</Badge>}
                      {req.status === 'link_sent' && <Badge className="bg-blue-600 text-white text-xs">Invite Sent</Badge>}
                      {req.status === 'approved' && <Badge className="bg-green-600 text-white text-xs">Approved</Badge>}
                      {req.status === 'approved_pending_setup' && (
                        <Badge className="bg-purple-600 text-white text-xs">Awaiting Setup</Badge>
                      )}
                      {req.status === 'denied' && <Badge variant="outline" className="text-xs">Denied</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{req.name} · {req.email}{req.phone ? ` · ${req.phone}` : ''}</p>
                    {req.message && <p className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</p>}
                    {(req as any).onboarding_data && (
                      <div className="mt-1.5 space-y-0.5">
                        {(req as any).onboarding_data.business_type && (
                          <p className="text-xs text-muted-foreground">Type: {(req as any).onboarding_data.business_type}</p>
                        )}
                        {(req as any).onboarding_data.monthly_volume && (
                          <p className="text-xs text-muted-foreground">Volume: {(req as any).onboarding_data.monthly_volume}</p>
                        )}
                        {(req as any).onboarding_data.products?.length > 0 && (
                          <p className="text-xs text-muted-foreground">Products: {(req as any).onboarding_data.products.join(', ')}</p>
                        )}
                        {(req as any).country && (
                          <p className="text-xs text-muted-foreground">Country: {(req as any).country}</p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(req.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  {req.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 h-8"
                        disabled={loading === req.id}
                        onClick={() => handleReview(req.id, 'approve')}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 h-8"
                        disabled={loading === req.id}
                        onClick={() => handleReview(req.id, 'deny')}
                      >
                        <XCircle className="h-3 w-3" />
                        Deny
                      </Button>
                    </div>
                  )}
                  {req.status === 'link_sent' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8 shrink-0"
                      disabled={loading === req.id}
                      onClick={() => handleResend(req.id)}
                    >
                      <Send className={`h-3 w-3 ${loading === req.id ? 'animate-spin' : ''}`} />
                      Resend
                    </Button>
                  )}
                  {req.status === 'approved_pending_setup' && (
                    <div className="flex flex-col gap-2 shrink-0 items-end">
                      <p className="text-xs text-muted-foreground text-right max-w-[120px]">Set prices in CRM first</p>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs h-8 bg-green-600 hover:bg-green-700"
                        disabled={loading === req.id}
                        onClick={() => handleSendAccess(req.id)}
                      >
                        <Send className={`h-3 w-3 ${loading === req.id ? 'animate-spin' : ''}`} />
                        Send Access
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'customers' && <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card size="sm" className="py-0">
          <CardContent className="py-2 flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <MailCheck className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{activeCount}</p>
              <p className="text-xs text-muted-foreground truncate">Portal Access</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm" className="py-0">
          <CardContent className="py-2 flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <ShieldOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{noAccessCount}</p>
              <p className="text-xs text-muted-foreground truncate">No Access</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="horeca">HORECA</SelectItem>
            <SelectItem value="supermarket">Supermarket</SelectItem>
            <SelectItem value="shops">Shops</SelectItem>
            <SelectItem value="dtf">DTF</SelectItem>
            <SelectItem value="other">Other</SelectItem>
            <SelectItem value="b2c">B2C</SelectItem>
            <SelectItem value="export">Export</SelectItem>
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {availableCountries.map(code => (
              <SelectItem key={code} value={code}>{code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Customer list */}
      <div className="space-y-2">
        {filtered.map(customer => {
          const status = getStatus(customer)
          const hasAccess = status !== 'no_access'
          const isActioning = loading === customer.id

          return (
            <Card key={customer.id} className="py-0">
              <CardContent className="py-2 px-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{customer.company_name}</p>
                    {countryCode(customer) && (
                      <Badge variant="outline" className="text-xs px-1 py-0 text-muted-foreground shrink-0">
                        {countryCode(customer)}
                      </Badge>
                    )}
                    {statusBadge(status)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {customer.email || <span className="text-orange-500">No email — add one first</span>}
                  </p>
                  {(customer as any).portal_invited_at && (
                    <p className="text-xs text-muted-foreground">
                      Invited {new Date((customer as any).portal_invited_at).toLocaleDateString()}
                    </p>
                  )}
                  {hasAccess && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {(customer as any).last_seen_at
                        ? `Last seen: ${new Date((customer as any).last_seen_at).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : 'Never logged in'}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  {hasAccess ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        disabled={isActioning}
                        onClick={() => handleInvite(customer)}
                      >
                        <RefreshCw className={`h-3 w-3 ${isActioning ? 'animate-spin' : ''}`} />
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        disabled={isActioning}
                        onClick={() => handleRevoke(customer)}
                      >
                        <ShieldOff className="h-3 w-3" />
                        Revoke
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs bg-red-600 hover:bg-red-700"
                      disabled={isActioning || !customer.email}
                      onClick={() => handleInvite(customer)}
                    >
                      <Mail className={`h-3 w-3 ${isActioning ? 'animate-spin' : ''}`} />
                      Invite
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">No customers found</p>
        )}
      </div>
      </>}
    </div>
  )
}
