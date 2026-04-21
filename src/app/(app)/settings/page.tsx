'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Settings, Users, FileText, Download } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useQuoteTemplates } from '@/hooks/use-quotes'
import { useOrders } from '@/hooks/use-orders'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { data: templates } = useQuoteTemplates()
  const { data: invoiceReadyOrders } = useOrders('invoice_ready')
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [isAdmin, authLoading, router])

  async function exportQuickBooksCSV() {
    if (!invoiceReadyOrders?.length) {
      toast.error('No invoice-ready orders to export')
      return
    }

    const headers = ['OrderNumber', 'CustomerName', 'QuickBooksID', 'Total', 'Date']
    const rows = invoiceReadyOrders.map((o) => [
      o.order_number,
      o.customer?.company_name ?? '',
      o.customer?.quickbooks_customer_id ?? '',
      Number(o.total).toFixed(2),
      new Date(o.created_at).toLocaleDateString(),
    ])

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spika-invoice-ready-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    toast.success('CSV exported')
  }

  if (authLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">Admin-only configuration</p>
      </div>

      {/* QuickBooks Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-5 w-5" />
            QuickBooks Export
          </CardTitle>
          <CardDescription>
            Export invoice-ready orders as CSV for QuickBooks import
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {invoiceReadyOrders?.length ?? 0} orders ready for invoicing
          </p>
          <Button
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={exportQuickBooksCSV}
            disabled={!invoiceReadyOrders?.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Quote Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Quote Templates
          </CardTitle>
          <CardDescription>
            Manage product catalogs and pricing per category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates?.map((t) => (
            <div key={t.id}>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {t.category} · {(t.items as any[]).length} items
                  </p>
                </div>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
              <Separator />
            </div>
          ))}
          <Button variant="outline" className="w-full">
            + Add Template
          </Button>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>Invite team members and manage roles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InviteUserForm />
        </CardContent>
      </Card>
    </div>
  )
}

function InviteUserForm() {
  const supabase = createClient()
  const [email, setEmail] = useState('')

  return (
    <div className="flex gap-2">
      <input
        type="email"
        placeholder="team@spika.com"
        className="flex-1 h-9 rounded-md border px-3 text-sm bg-background"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        size="sm"
        onClick={async () => {
          if (!email) return
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: true },
          })
          if (error) toast.error(error.message)
          else toast.success(`Invite sent to ${email}`)
          setEmail('')
        }}
      >
        Invite
      </Button>
    </div>
  )
}
