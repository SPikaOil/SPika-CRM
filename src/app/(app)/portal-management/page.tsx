'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Mail, MailCheck, ShieldOff, RefreshCw, Globe } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useCustomers } from '@/hooks/use-customers'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  const [portalUsers, setPortalUsers] = useState<Record<string, string>>({}) // customer_id → user_id
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null) // customer_id being actioned
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

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

  const filtered = (customers ?? [])
    .filter(c => c.status === 'active')
    .filter(c =>
      !search ||
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    )

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
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-red-600" />
          Customer Portal
        </h1>
        <p className="text-muted-foreground text-sm">
          {activeCount} with access · {noAccessCount} without access
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <MailCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Portal Access</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{noAccessCount}</p>
              <p className="text-xs text-muted-foreground">No Access</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Customer list */}
      <div className="space-y-2">
        {filtered.map(customer => {
          const status = getStatus(customer)
          const hasAccess = status !== 'no_access'
          const isActioning = loading === customer.id

          return (
            <Card key={customer.id}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{customer.company_name}</p>
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
    </div>
  )
}
