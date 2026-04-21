'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Building2 } from 'lucide-react'
import { useCustomer, useUpdateCustomer } from '@/hooks/use-customers'
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
  const updateCustomer = useUpdateCustomer()
  const [editing, setEditing] = useState(false)
  const router = useRouter()

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
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setEditing(true)}
        >
          <Edit className="h-4 w-4" />
          Edit
        </Button>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
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

        <TabsContent value="orders">
          <div className="py-10 text-center text-muted-foreground">
            <p>Order history coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="quotes">
          <div className="py-10 text-center text-muted-foreground">
            <p>Quote history coming soon</p>
          </div>
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
