'use client'

import { use, useMemo, useState } from 'react'
import { formatTaxId } from '@/lib/tax-id'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Building2, Package, CheckCircle2, Clock, Truck, FileSignature, AlertTriangle, Download, Upload, Info, RefreshCw, CalendarClock, Trash2, Power, X } from 'lucide-react'
import { useRef } from 'react'
import { useCustomer, useUpdateCustomer } from '@/hooks/use-customers'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useCustomerOrders } from '@/hooks/use-orders'
import { useCustomerSigners, useHideCustomerSigner } from '@/hooks/use-customer-signers'
import { useCustomerPortalUsers } from '@/hooks/use-customer-portal-users'
import { useCreateTask } from '@/hooks/use-tasks'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CustomerForm } from '../_components/customer-form'
import { Customer, SPIKA_STAND_TYPES } from '@/types'

const categoryColors: Record<string, string> = {
  wholesale:   'bg-blue-100 text-blue-700',
  horeca:      'bg-purple-100 text-purple-700',
  supermarket: 'bg-cyan-100 text-cyan-700',
  shops:       'bg-pink-100 text-pink-700',
  dtf:         'bg-green-100 text-green-700',
  other:       'bg-gray-100 text-gray-700',
  b2c:         'bg-orange-100 text-orange-700',
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: customer, isLoading } = useCustomer(id)
  const { data: orders } = useCustomerOrders(id)
  const { data: signers } = useCustomerSigners(id)
  const { data: portalUsers } = useCustomerPortalUsers(id)
  const updateCustomer = useUpdateCustomer()
  const { isAdmin, profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isOpeningOB, setIsOpeningOB] = useState(false)
  const [bottleInterval, setBottleInterval] = useState<string>('')
  const [signerToRemove, setSignerToRemove] = useState<string | null>(null)
  const hideSigner = useHideCustomerSigner()
  const router = useRouter()
  const supabase = createClient()
  const obFileRef = useRef<HTMLInputElement>(null)
  const createTask = useCreateTask()

  async function handleUploadOB(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !customer) return
    setIsUploading(true)
    try {
      const safeCust = (customer.company_name ?? customer.id).replace(/[/\\:*?"<>|]/g, '').trim()
      const path = `ob-forms/${safeCust} - OB Form.pdf`
      const { error } = await supabase.storage.from('pod-files').upload(path, file, { upsert: true })
      if (error) throw error
      await updateCustomer.mutateAsync({ id, values: {
        ob_form_signed: true,
        ob_form_signed_at: new Date().toISOString(),
        ob_form_signed_url: path,
        ob_form_signer_name: 'Uploaded manually',
      } as any })
      toast.success('OB form uploaded and marked as signed!')
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed')
    } finally {
      setIsUploading(false)
      if (obFileRef.current) obFileRef.current.value = ''
    }
  }

  async function handleViewOB() {
    if (!customer?.ob_form_signed_url) return
    setIsOpeningOB(true)
    try {
      const raw = customer.ob_form_signed_url
      // Support both stored formats:
      // 1. New: plain storage path like "ob-forms/id/file.pdf"
      // 2. Old: full public URL like "https://…/object/public/pod-files/ob-forms/…"
      const urlMatch = raw.match(/\/object\/(?:public\/)?pod-files\/(.+)$/)
      const storagePath = urlMatch ? urlMatch[1] : raw

      const { data, error } = await supabase.storage.from('pod-files').download(storagePath)
      if (error || !data) throw error ?? new Error('Could not download file')
      const blobUrl = URL.createObjectURL(data)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
    } catch (err: any) {
      toast.error(err.message ?? 'Could not open file')
    } finally {
      setIsOpeningOB(false)
    }
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function onUpdate(values: Partial<Customer>) {
    await updateCustomer.mutateAsync({ id, values })
    setEditing(false)
  }

  async function handleDelete() {
    if (!deletePassword) return
    setDeleting(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: deletePassword,
      })
      if (authError) {
        toast.error('Incorrect password')
        setDeleting(false)
        return
      }
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      toast.success(`${customer?.company_name} deleted`)
      router.replace('/customers')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete customer')
    } finally {
      setDeleting(false)
    }
  }

  // All useMemo hooks must be before any early returns (Rules of Hooks)
  const lastBottleRefresh = useMemo(() => {
    if (!orders) return null
    try {
      const delivered = orders
        .filter(o => (o.delivery as any)?.table_bottles_returned > 0 && (o.delivery as any)?.delivered_at)
        .sort((a, b) => new Date((b.delivery as any).delivered_at).getTime() - new Date((a.delivery as any).delivered_at).getTime())
      return delivered[0]?.delivery as any ?? null
    } catch { return null }
  }, [orders])

  const intervalWeeks = bottleInterval
    ? parseInt(bottleInterval)
    : ((customer as any)?.table_bottle_interval_weeks ?? null)

  const nextRefreshDate = useMemo(() => {
    if (!lastBottleRefresh?.delivered_at || !intervalWeeks) return null
    try {
      const d = new Date(lastBottleRefresh.delivered_at)
      d.setDate(d.getDate() + intervalWeeks * 7)
      return d
    } catch { return null }
  }, [lastBottleRefresh, intervalWeeks])

  const daysUntilRefresh = nextRefreshDate
    ? Math.ceil((nextRefreshDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20 gap-3">
        <Building2 className="h-12 w-12 opacity-20" />
        <p className="font-medium">Customer not found</p>
        <Link href="/customers">
          <Button variant="outline">Back to Customers</Button>
        </Link>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4 overflow-x-hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setEditing(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Edit Customer</h1>
        </div>
        <CustomerForm
          defaultValues={customer}
          onSubmit={onUpdate}
          isLoading={updateCustomer.isPending}
        />
      </div>
    )
  }

  const billingAddr = customer.billing_address as any
  const deliveryAddr = customer.delivery_address as any

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-3xl mx-auto">
      {/* Header — action labels collapse to icons on mobile so nothing overflows */}
      <div className="flex items-start gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0 h-8 w-8"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{customer.company_name}</h1>
            {(customer as any).customer_number && (
              <span className="font-mono text-xs text-muted-foreground">{(customer as any).customer_number}</span>
            )}
            <Badge className={`capitalize text-[10px] px-1.5 py-0 ${categoryColors[customer.customer_category]}`}>
              {customer.customer_category}
            </Badge>
            {customer.status === 'inactive' && (
              <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">Inactive</Badge>
            )}
            {(customer as any).is_consignment && (
              <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0">📦 Consignment</Badge>
            )}
          </div>
          {customer.contact_person && (
            <p className="text-muted-foreground text-xs truncate">{customer.contact_person}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 px-2"
              onClick={() => setEditing(true)}
            >
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 h-8 px-2 ${customer.status === 'inactive' ? 'border-green-200 text-green-600 hover:bg-green-50' : 'text-muted-foreground'}`}
              disabled={updateCustomer.isPending}
              title={customer.status === 'inactive' ? 'Activate customer' : 'Deactivate customer'}
              onClick={() => updateCustomer.mutate({ id: customer.id, values: { status: customer.status === 'inactive' ? 'active' : 'inactive' } as any })}
            >
              <Power className="h-4 w-4" />
              <span className="hidden sm:inline">{customer.status === 'inactive' ? 'Activate' : 'Deactivate'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 border-red-200 text-red-500 hover:bg-red-50"
              title="Delete customer"
              onClick={() => { setDeletePassword(''); setShowDeleteModal(true) }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="orders">
            Orders {orders && orders.length > 0 && `(${orders.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-2.5 mt-3">
          <Card className="py-0">
            <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pb-3">
              {customer.phone && <Row label="Phone" value={customer.phone} />}
              {customer.whatsapp && <Row label="WhatsApp" value={customer.whatsapp} />}
              {customer.email && <Row label="Email" value={customer.email} />}
              <Row label="Preferred" value={customer.preferred_communication} />
              <Row label="Language" value={customer.language} />
              {isAdmin && (
                <Row
                  label="Last seen in portal"
                  value={(customer as any).last_seen_at
                    ? new Date((customer as any).last_seen_at).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Never'}
                />
              )}
            </CardContent>
          </Card>

          {signers && signers.length > 0 && (
            <Card className="py-0">
              <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Contact people who sign</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {signers.map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-3">
                    <span className="font-medium">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {s.count}× signed{s.last ? ` · last ${new Date(s.last).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </span>
                      {/* Admin only — removes the name from this list, past deliveries stay intact */}
                      {isAdmin && (
                        <button
                          type="button"
                          title={`Remove ${s.name} from this list`}
                          aria-label={`Remove ${s.name} from this list`}
                          onClick={() => setSignerToRemove(s.name)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Learned automatically from completed deliveries.
                  {isAdmin && ' Remove someone with the ✕ — past deliveries keep their signature.'}
                </p>
              </CardContent>
            </Card>
          )}

          {portalUsers && portalUsers.length > 0 && (
            <Card className="py-0">
              <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Portal team members</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {portalUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium">{u.name ?? '—'}</span>
                      {u.customer_role === 'owner' && <Badge className="ml-2 bg-amber-100 text-amber-700 text-xs">Owner</Badge>}
                      {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {u.last_seen_at ? `seen ${new Date(u.last_seen_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}` : 'never logged in'}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">People with portal access — including anyone the customer invited themselves.</p>
              </CardContent>
            </Card>
          )}

          <Card className="py-0">
            <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Delivery</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pb-3">
              {customer.delivery_time_window && (
                <Row label="Time Window" value={customer.delivery_time_window} />
              )}
              <Row label="OB Form" value={customer.ob_form_required ? 'Required' : 'Not required'} />
              <Row label="Packing Slip" value={customer.packing_slip_required ? 'Required' : 'Not required'} />
              <Row label="Table Bottles" value={customer.track_table_bottles ? 'Tracked' : 'Not tracked'} />
              {customer.track_table_bottles && (customer as any).table_count != null && (
                <Row label="Tables at Customer" value={String((customer as any).table_count)} />
              )}
              {customer.discount_agreement && (
                <Row label="Discount" value={customer.discount_agreement} className="sm:col-span-2" />
              )}
              {(() => {
                const stands: any[] = (customer as any).spika_stands ?? []
                if (stands.length === 0) return null
                const totalCapacity = stands.reduce((sum: number, s: any) => {
                  const def = SPIKA_STAND_TYPES.find(st => st.value === s.type)
                  return sum + (def?.capacity ?? 0) * (s.qty ?? 1)
                }, 0)
                return (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground">SPika Stands</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {stands.map((s: any) => {
                        const def = SPIKA_STAND_TYPES.find(st => st.value === s.type)
                        return (
                          <span key={s.type} className="text-xs bg-muted px-2 py-1 rounded-md font-medium">
                            {s.qty}× {def?.label ?? s.type}
                          </span>
                        )
                      })}
                      <span className="text-xs text-muted-foreground self-center ml-1">({totalCapacity} btls total capacity)</span>
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Table Bottle Schedule */}
          {customer.track_table_bottles && isAdmin && (
            <Card className={daysUntilRefresh !== null && daysUntilRefresh <= 7 ? 'border-orange-300' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-500" />
                  Table Bottle Refresh Schedule
                  {daysUntilRefresh !== null && (
                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                      daysUntilRefresh < 0 ? 'bg-red-100 text-red-700' :
                      daysUntilRefresh <= 7 ? 'bg-orange-100 text-orange-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {daysUntilRefresh < 0 ? `${Math.abs(daysUntilRefresh)}d overdue` :
                       daysUntilRefresh === 0 ? 'Due today' :
                       `Due in ${daysUntilRefresh}d`}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pb-3">
                  {(customer as any).table_count != null && (
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground mb-1">Tables at Customer</p>
                      <p className="font-medium text-lg">{(customer as any).table_count} tables</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground mb-1">Last Refresh</p>
                    <p className="font-medium">
                      {lastBottleRefresh?.delivered_at
                        ? new Date(lastBottleRefresh.delivered_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                    {lastBottleRefresh?.table_bottles_returned > 0 && (
                      <p className="text-xs text-muted-foreground">{lastBottleRefresh.table_bottles_returned} bottles returned</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Next Refresh</p>
                    <p className={`font-medium ${daysUntilRefresh !== null && daysUntilRefresh < 0 ? 'text-red-600' : ''}`}>
                      {nextRefreshDate
                        ? nextRefreshDate.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Refresh Interval</p>
                    <Select
                      value={bottleInterval || String(customer.table_bottle_interval_weeks ?? '')}
                      onValueChange={(v) => { if (v) setBottleInterval(v) }}
                    >
                      <SelectTrigger className="w-40 h-8 text-sm">
                        <SelectValue placeholder="Set interval…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Every week</SelectItem>
                        <SelectItem value="2">Every 2 weeks</SelectItem>
                        <SelectItem value="4">Every 4 weeks</SelectItem>
                        <SelectItem value="6">Every 6 weeks</SelectItem>
                        <SelectItem value="8">Every 8 weeks</SelectItem>
                        <SelectItem value="12">Every 3 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {bottleInterval && bottleInterval !== String(customer.table_bottle_interval_weeks ?? '') && (
                    <Button
                      size="sm"
                      className="h-8 bg-red-600 hover:bg-red-700"
                      onClick={() => updateCustomer.mutate({ id, values: { table_bottle_interval_weeks: parseInt(bottleInterval) } as any }, {
                        onSuccess: () => { setBottleInterval(''); toast.success('Interval saved') }
                      })}
                      disabled={updateCustomer.isPending}
                    >
                      Save
                    </Button>
                  )}
                </div>

                {nextRefreshDate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={createTask.isPending}
                    onClick={() => {
                      const due = nextRefreshDate.toISOString().split('T')[0]
                      createTask.mutate({
                        customer_id: id,
                        title: `Table bottle refresh — ${customer.company_name}`,
                        description: `Replace table bottles with fresh oil. Interval: every ${intervalWeeks} week(s).`,
                        frequency: 'once',
                        due_date: due,
                        assigned_to: null,
                        created_by: profile?.id ?? '',
                      } as any, {
                        onSuccess: () => toast.success('Refresh task scheduled!')
                      })
                    }}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule Refresh Task
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* OB Form */}
          {customer.ob_form_required && (
            <Card className={customer.ob_form_signed ? 'border-green-200' : 'border-red-300 bg-red-50 dark:bg-red-950/20'}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSignature className={`h-4 w-4 ${customer.ob_form_signed ? 'text-green-600' : 'text-red-600'}`} />
                  OB Declaratie Formulier 2026
                  {customer.ob_form_signed
                    ? <span className="text-xs font-normal text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Signed</span>
                    : <span className="text-xs font-normal text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Missing</span>
                  }
                  <div className="relative group ml-auto">
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    <div className="absolute right-0 top-6 z-10 hidden group-hover:block w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                      This form prevents charging double OB on the same product. It confirms you&apos;re selling to the end consumer — we&apos;re the producer, you&apos;re the final seller.
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {customer.ob_form_signed ? (
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">
                      Signed by <span className="font-medium text-foreground">{customer.ob_form_signer_name}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {customer.ob_form_signed_at
                        ? new Date(customer.ob_form_signed_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
                        : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-red-700 dark:text-red-400">
                    This customer requires an OB form but has not signed one yet.
                  </p>
                )}
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/customers/${id}/ob-sign`}>
                      <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700">
                        <FileSignature className="h-3.5 w-3.5" />
                        {customer.ob_form_signed ? 'Re-sign' : 'Sign Digitally'}
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => obFileRef.current?.click()} disabled={isUploading}>
                      <Upload className="h-3.5 w-3.5" />
                      {isUploading ? 'Uploading…' : 'Upload Signed Copy'}
                    </Button>
                    <input ref={obFileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUploadOB} />
                    {customer.ob_form_signed_url && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleViewOB} disabled={isOpeningOB}>
                        <Download className="h-3.5 w-3.5" />
                        {isOpeningOB ? 'Opening…' : 'View Signed Form'}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(billingAddr?.street || deliveryAddr?.street) && (
            <Card className="py-0">
              <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Addresses</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pb-3">
                {billingAddr?.street && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Billing</p>
                    <p>{billingAddr.street}</p>
                    <p>{billingAddr.zip} {billingAddr.city}</p>
                    <p>{billingAddr.country}</p>
                  </div>
                )}
                {deliveryAddr?.street && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Delivery</p>
                    <p>{deliveryAddr.street}</p>
                    <p>{deliveryAddr.zip} {deliveryAddr.city}</p>
                    <p>{deliveryAddr.country}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Business / Tax Details */}
          {(customer.vat_number || customer.crib_number || customer.coc_number || customer.is_international) && (
            <Card className="py-0">
              <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Business Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pb-3">
                {(() => {
                  const taxId = formatTaxId(
                    billingAddr?.country ?? '',
                    customer.vat_number,
                    customer.crib_number,
                  )
                  return taxId ? <Row label="Tax ID" value={taxId} /> : null
                })()}
                {customer.coc_number && <Row label="CoC Number" value={customer.coc_number} />}
                {customer.is_international && (
                  <Row label="International" value="Yes — exports eligible" />
                )}
                {customer.payment_term_days && (
                  <Row label="Payment Term" value={`${customer.payment_term_days} days`} />
                )}
              </CardContent>
            </Card>
          )}

          {(customer.internal_notes || customer.quickbooks_customer_id) && (
            <Card className="py-0">
              <CardHeader className="pt-3 pb-2"><CardTitle className="text-sm">Internal</CardTitle></CardHeader>
              <CardContent className="space-y-1 pb-3">
                {customer.quickbooks_customer_id && (
                  <Row label="QuickBooks ID" value={customer.quickbooks_customer_id} />
                )}
                {customer.internal_notes && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Notes</p>
                    <p className="whitespace-pre-wrap">{customer.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-1.5 mt-3">
          {!orders || orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Package className="h-10 w-10 opacity-20" />
              <p className="font-medium">No orders yet</p>
              <p className="text-sm">Orders will appear here once created</p>
              <Link href={`/quotes/new?customer=${id}`}>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 mt-1">New Delivery Note</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{orders.length} order{orders.length !== 1 ? 's' : ''} total</p>
                <Link href={`/quotes/new?customer=${id}`}>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700">+ New</Button>
                </Link>
              </div>
              {orders.map((order) => {
                const statusIcon = order.status === 'delivered'
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : order.status === 'out_for_delivery'
                  ? <Truck className="h-4 w-4 text-blue-500" />
                  : <Clock className="h-4 w-4 text-muted-foreground" />

                const statusColor = order.status === 'delivered'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : order.status === 'out_for_delivery'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'

                const items = (order.items as any[]) ?? []
                const activeItems = items.filter(i => i.qty > 0)

                return (
                  <Link key={order.id} href={`/orders/${order.id}`}>
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <div className="shrink-0">{statusIcon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{order.order_number || 'Order'}</p>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 capitalize shrink-0 ${statusColor}`}>
                            {order.status?.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {order.planned_date && new Date(order.planned_date).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                          {(order as any).assigned_user?.name && ` · ${(order as any).assigned_user.name}`}
                          {activeItems.length > 0 && ` · ${activeItems.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(', ')}`}
                        </p>
                      </div>
                      <span className="text-sm font-medium shrink-0">XCG {Number(order.total ?? 0).toFixed(2)}</span>
                    </div>
                  </Link>
                )
              })}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Remove signer confirmation — admin only */}
      {signerToRemove && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-muted-foreground" />
                Remove {signerToRemove}?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {signerToRemove} will no longer be suggested as a signer for{' '}
                <span className="font-medium">{customer.company_name}</span>, here and during delivery.
              </p>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Past deliveries are <span className="font-medium">not</span> changed — they keep their
                  signature and signer name as proof of delivery.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSignerToRemove(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={hideSigner.isPending}
                  onClick={async () => {
                    await hideSigner.mutateAsync({ customerId: id, name: signerToRemove })
                    setSignerToRemove(null)
                  }}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete {customer.company_name}?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will permanently delete the customer profile. This action <span className="font-semibold text-red-600">cannot be undone</span>.
              </p>
              {orders && orders.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    This customer has <span className="font-semibold">{orders.length} order{orders.length > 1 ? 's' : ''}</span>. Deleting will also remove all associated data.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Confirm your password <span className="text-red-500">*</span></Label>
                <Input
                  type="password"
                  placeholder="Your account password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && deletePassword && handleDelete()}
                />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowDeleteModal(false); setDeletePassword('') }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!deletePassword || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? 'Deleting...' : 'Delete Customer'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  // One line per field (label left, value right) — keeps the cards thin on mobile
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className ?? ''}`}>
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span
        title={value}
        className={`text-sm font-medium text-right truncate ${value?.includes('@') ? '' : 'capitalize'}`}
      >
        {value}
      </span>
    </div>
  )
}
