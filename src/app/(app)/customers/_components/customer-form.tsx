'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Customer } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'

const customerSchema = z.object({
  company_name: z.string().min(1, 'Required'),
  customer_category: z.enum(['wholesale', 'horeca', 'dtf', 'other', 'b2c']),
  contact_person: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  email: z.string().email('Invalid email').or(z.literal('')),
  delivery_time_window: z.string(),
  ob_form_required: z.boolean(),
  packing_slip_required: z.boolean(),
  track_table_bottles: z.boolean(),
  table_bottle_return_price: z.number().min(0),
  hardcopy_required: z.boolean(),
  require_delivery_photo: z.boolean(),
  discount_agreement: z.string(),
  preferred_communication: z.enum(['whatsapp', 'email', 'phone']),
  language: z.string(),
  internal_notes: z.string(),
  quickbooks_customer_id: z.string(),
  vat_number: z.string(),
  coc_number: z.string(),
  status: z.enum(['active', 'inactive']),
  // Address fields (flattened for the form, composed to JSONB on submit)
  billing_street: z.string(),
  billing_city: z.string(),
  billing_zip: z.string(),
  billing_country: z.string(),
  delivery_street: z.string(),
  delivery_city: z.string(),
  delivery_zip: z.string(),
  delivery_country: z.string(),
})

type CustomerFormValues = z.infer<typeof customerSchema>

interface Props {
  defaultValues?: Partial<Customer>
  onSubmit: (values: Partial<Customer>) => Promise<void>
  isLoading?: boolean
}

function toFormValues(customer?: Partial<Customer>): Partial<CustomerFormValues> {
  if (!customer) return {}
  return {
    ...customer,
    billing_street: (customer.billing_address as any)?.street ?? '',
    billing_city: (customer.billing_address as any)?.city ?? '',
    billing_zip: (customer.billing_address as any)?.zip ?? '',
    billing_country: (customer.billing_address as any)?.country ?? '',
    delivery_street: (customer.delivery_address as any)?.street ?? '',
    delivery_city: (customer.delivery_address as any)?.city ?? '',
    delivery_zip: (customer.delivery_address as any)?.zip ?? '',
    delivery_country: (customer.delivery_address as any)?.country ?? '',
  }
}

export function CustomerForm({ defaultValues, onSubmit, isLoading }: Props) {
  // Product prices — keyed by SKU, pre-filled from existing customer or product defaults
  const [productPrices, setProductPrices] = useState<Record<string, number>>(() => {
    const existing = defaultValues?.product_prices ?? {}
    const result: Record<string, number> = {}
    for (const p of SPIKA_PRODUCTS) {
      result[p.sku] = existing[p.sku] ?? p.default_price
    }
    return result
  })

  // Product discounts — per-unit discount amount keyed by SKU
  const [productDiscounts, setProductDiscounts] = useState<Record<string, number>>(() => {
    const existing = defaultValues?.product_discounts ?? {}
    const result: Record<string, number> = {}
    for (const p of SPIKA_PRODUCTS) {
      result[p.sku] = existing[p.sku] ?? 0
    }
    return result
  })

  // Free of charge products — set of SKUs that are free for this customer
  const [freeProducts, setFreeProducts] = useState<Set<string>>(
    () => new Set(defaultValues?.free_products ?? [])
  )

  function toggleFreeProduct(sku: string) {
    setFreeProducts((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  const formDefaults: CustomerFormValues = {
    company_name: '',
    customer_category: 'other',
    contact_person: '',
    phone: '',
    whatsapp: '',
    email: '',
    delivery_time_window: '',
    ob_form_required: false,
    packing_slip_required: false,
    track_table_bottles: false,
    table_bottle_return_price: 2.50,
    hardcopy_required: false,
    require_delivery_photo: false,
    discount_agreement: '',
    preferred_communication: 'whatsapp',
    language: 'English',
    internal_notes: '',
    quickbooks_customer_id: '',
    vat_number: '',
    coc_number: '',
    status: 'active',
    billing_street: '',
    billing_city: '',
    billing_zip: '',
    billing_country: '',
    delivery_street: '',
    delivery_city: '',
    delivery_zip: '',
    delivery_country: '',
    ...toFormValues(defaultValues),
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: formDefaults,
  })

  async function handleFormSubmit(data: CustomerFormValues) {
    const {
      billing_street, billing_city, billing_zip, billing_country,
      delivery_street, delivery_city, delivery_zip, delivery_country,
      ...rest
    } = data

    await onSubmit({
      ...rest,
      product_prices: productPrices,
      product_discounts: productDiscounts,
      free_products: Array.from(freeProducts),
      billing_address: {
        street: billing_street,
        city: billing_city,
        state: '',
        zip: billing_zip,
        country: billing_country,
      },
      delivery_address: {
        street: delivery_street,
        city: delivery_city,
        state: '',
        zip: delivery_zip,
        country: delivery_country,
      },
    })
  }

  const category = watch('customer_category')
  const preferredComm = watch('preferred_communication')
  const status = watch('status')

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Basic Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company Name *</Label>
              <Input {...register('company_name')} placeholder="Acme Restaurants" />
              {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select
                value={category}
                onValueChange={(v) => setValue('customer_category', v as any)}
              >
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wholesale">Wholesale (B2B)</SelectItem>
                  <SelectItem value="horeca">HORECA (B2B)</SelectItem>
                  <SelectItem value="dtf">DTF (B2B)</SelectItem>
                  <SelectItem value="other">Other (B2B)</SelectItem>
                  <SelectItem value="b2c">B2C (Individual)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {category === 'b2c' ? '6% tax applies (B2C)' : '0% tax — tax-exempt B2B customer'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person *</Label>
              <Input {...register('contact_person')} placeholder="John Smith" />
              {errors.contact_person && <p className="text-xs text-destructive">{errors.contact_person.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue('status', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contact Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register('phone')} placeholder="+1 555 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input {...register('whatsapp')} placeholder="+1 555 000 0000" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input {...register('email')} type="email" placeholder="contact@company.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Preferred Communication</Label>
              <Select value={preferredComm} onValueChange={(v) => setValue('preferred_communication', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Input {...register('language')} placeholder="English" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Delivery Time Window</Label>
            <Input {...register('delivery_time_window')} placeholder="09:00-17:00" />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('ob_form_required')} className="rounded" />
              <span className="text-sm">OB Form Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('packing_slip_required')} className="rounded" />
              <span className="text-sm">Packing Slip Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('track_table_bottles')} className="rounded" />
              <span className="text-sm">Track Table Bottles</span>
            </label>
            <div className="flex items-center gap-2 pl-6">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Return price per bottle (XCG)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-7 w-24 text-right text-sm"
                {...register('table_bottle_return_price', { valueAsNumber: true })}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('hardcopy_required')} className="rounded" />
              <span className="text-sm font-medium text-orange-600">🖨️ Hard Copy Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('require_delivery_photo')} className="rounded" />
              <span className="text-sm font-medium text-blue-600">📷 Delivery Photo Required</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Hard copy: worker is reminded to bring a printed note. Delivery photo: worker must take a photo to complete the delivery.</p>
        </CardContent>
      </Card>

      {/* Billing Address */}
      <Card>
        <CardHeader><CardTitle className="text-base">Billing Address</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Street</Label>
              <Input {...register('billing_street')} placeholder="123 Main St" />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input {...register('billing_city')} placeholder="Amsterdam" />
            </div>
            <div className="space-y-1.5">
              <Label>Zip Code</Label>
              <Input {...register('billing_zip')} placeholder="1234 AB" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Country</Label>
              <Input {...register('billing_country')} placeholder="Netherlands" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Address */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Address</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Street</Label>
              <Input {...register('delivery_street')} placeholder="123 Main St" />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input {...register('delivery_city')} placeholder="Amsterdam" />
            </div>
            <div className="space-y-1.5">
              <Label>Zip Code</Label>
              <Input {...register('delivery_zip')} placeholder="1234 AB" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Country</Label>
              <Input {...register('delivery_country')} placeholder="Netherlands" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business */}
      <Card>
        <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {category !== 'b2c' && (
            <div className="space-y-1.5">
              <Label>VAT Number</Label>
              <Input {...register('vat_number')} placeholder="e.g. NL123456789B01" />
              <p className="text-xs text-muted-foreground">Business VAT registration number (for tax-exempt invoicing)</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>CoC Number <span className="text-muted-foreground text-xs">(Kamer van Koophandel)</span></Label>
            <Input {...register('coc_number')} placeholder="e.g. 12345678" />
          </div>
          <div className="space-y-1.5">
            <Label>Discount Agreement</Label>
            <Input {...register('discount_agreement')} placeholder="e.g. 10% on orders >500" />
          </div>
          <div className="space-y-1.5">
            <Label>QuickBooks Customer ID</Label>
            <Input {...register('quickbooks_customer_id')} placeholder="QB-123" />
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea {...register('internal_notes')} placeholder="Any internal notes..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Product Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Pricing</CardTitle>
          <p className="text-xs text-muted-foreground">Set the agreed price per product for this customer. These prices auto-fill when creating a delivery note.</p>
        </CardHeader>
        <CardContent className="space-y-0">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0 items-center text-xs font-medium text-muted-foreground pb-2 border-b">
            <span>Product</span>
            <span className="text-right w-20">Standard</span>
            <span className="text-right w-24">Customer Price</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center pb-1.5 border-b mb-1">
            <span className="text-xs text-muted-foreground font-medium">Product</span>
            <span className="text-xs text-muted-foreground w-20 text-right">Default</span>
            <span className="text-xs text-muted-foreground w-24 text-center">Price (XCG)</span>
            <span className="text-xs text-muted-foreground w-24 text-center">Discount (XCG)</span>
            <span className="text-xs text-muted-foreground w-16 text-center">Free</span>
          </div>
          {SPIKA_PRODUCTS.map((product) => {
            const isFree = freeProducts.has(product.sku)
            return (
              <div key={product.sku} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center py-2.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.sku}</p>
                </div>
                <span className="text-sm text-muted-foreground w-20 text-right">
                  XCG {product.default_price.toFixed(2)}
                </span>
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={productPrices[product.sku] ?? product.default_price}
                    onChange={(e) =>
                      setProductPrices((prev) => ({
                        ...prev,
                        [product.sku]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-right"
                    disabled={isFree}
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={productDiscounts[product.sku] ?? 0}
                    onChange={(e) =>
                      setProductDiscounts((prev) => ({
                        ...prev,
                        [product.sku]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-right"
                    disabled={isFree}
                  />
                </div>
                <div className="w-16 flex justify-center">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFree}
                      onChange={() => toggleFreeProduct(product.sku)}
                      className="rounded"
                    />
                    <span className="text-xs text-green-600 font-medium">Free</span>
                  </label>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Button
        type="submit"
        className="w-full bg-red-600 hover:bg-red-700"
        disabled={isLoading}
      >
        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save Customer
      </Button>
    </form>
  )
}
