'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Building2, Package, CheckCircle2, Clock, Truck, FileSignature, AlertTriangle, Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useCustomer, useUpdateCustomer } from '@/hooks/use-customers'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useCustomerOrders } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomerForm } from '../_components/customer-form'
import { Customer } from '@/types'

const categoryColors: Record<string, string> = {
  wholesale: 'bg-blue-100 text-blue-700',
  horeca: 'bg-purple-100 text-purple-700',
  dtf: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: customer, isLoading } = useCustomer(id)
  const { data: orders } = useCustomerOrders(id)
  const updateCustomer = useUpdateCustomer()
  const { isAdmin } = useAuth()
  const [editing, setEditing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isOpeningOB, setIsOpeningOB] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const obFileRef = useRef<HTMLInputElement>(null)

  async function handleUploadOB(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !customer) return
    setIsUploading(true)
    try {
      const path = `ob-forms/${customer.id}/${Date.now()}_${file.name}`
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

  async function onUpdate(values: Partial<Customer>) {
    await updateCustomer.mutateAsync({ id, values })
    setEditing(false)
  }

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
      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
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
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="mt-0.5"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{customer.company_name}</h1>
            <Badge className={`capitalize ${categoryColors[customer.customer_category]}`}>
              {customer.customer_category}
            </Badge>
            {customer.status === 'inactive' && (
              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">{customer.contact_person}</p>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing(true)}
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="orders">
            Orders {orders && orders.length > 0 && `(${orders.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {customer.phone && <Row label="Phone" value={customer.phone} />}
              {customer.whatsapp && <Row label="WhatsApp" value={customer.whatsapp} />}
              {customer.email && <Row label="Email" value={customer.email} />}
              <Row label="Preferred" value={customer.preferred_communication} />
              <Row label="Language" value={customer.language} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Delivery</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {customer.delivery_time_window && (
                <Row label="Time Window" value={customer.delivery_time_window} />
              )}
              <Row label="OB Form" value={customer.ob_form_required ? 'Required' : 'Not required'} />
              <Row label="Packing Slip" value={customer.packing_slip_required ? 'Required' : 'Not required'} />
              <Row label="Table Bottles" value={customer.track_table_bottles ? 'Tracked' : 'Not tracked'} />
              {customer.discount_agreement && (
                <Row label="Discount" value={customer.discount_agreement} className="sm:col-span-2" />
              )}
            </CardContent>
          </Card>

          {/* OB Form */}
          {customer.ob_form_required && (
            <Card className={customer.ob_form_signed ? 'border-green-200' : 'border-red-300 bg-red-50 dark:bg-red-950/20'}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSignature className={`h-4 w-4 ${customer.ob_form_signed ? 'text-green-600' : 'text-red-600'}`} />
                  OB Declaratie Formulier 2026
                  {customer.ob_form_signed
                    ? <span className="text-xs font-normal text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Signed</span>
                    : <span className="text-xs font-normal text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Missing</span>
                  }
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
            <Card>
              <CardHeader><CardTitle className="text-base">Addresses</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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

          {(customer.internal_notes || customer.quickbooks_customer_id) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Internal</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
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

        <TabsContent value="orders" className="space-y-3 mt-3">
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
                    <div className="flex items-start gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors">
                      <div className="mt-0.5">{statusIcon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-medium text-sm">{order.order_number || 'Order'}</p>
                          <Badge variant="secondary" className={`text-xs capitalize ${statusColor}`}>
                            {order.status?.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        {activeItems.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {activeItems.map(i => `${i.qty}× ${i.name}`).join(', ')}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {order.planned_date && (
                            <span>{new Date(order.planned_date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          )}
                          {(order as any).assigned_user?.name && (
                            <span>→ {(order as any).assigned_user.name}</span>
                          )}
                          <span className="ml-auto font-medium text-foreground">XCG {Number(order.total ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </>
          )}
        </TabsContent>
      </Tabs>
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
  return (
    <div className={className}>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  )
}
