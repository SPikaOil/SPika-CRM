'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, X } from 'lucide-react'
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
import { Customer, SpikaStand, SPIKA_STAND_TYPES } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getTaxIdInfo } from '@/lib/tax-id'

const customerSchema = z.object({
  company_name: z.string().min(1, 'Required'),
  customer_category: z.enum(['wholesale', 'horeca', 'dtf', 'other', 'b2c', 'supermarket', 'shops']),
  contact_person: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  email: z.string().email('Invalid email').or(z.literal('')),
  delivery_time_window: z.string(),
  ob_form_required: z.boolean(),
  packing_slip_required: z.boolean(),
  track_table_bottles: z.boolean(),
  table_count: z.string().optional(),
  table_bottle_return_price: z.number().min(0),
  payment_term_days: z.number().min(1),
  hardcopy_required: z.boolean(),
  require_delivery_photo: z.boolean(),
  discount_agreement: z.string(),
  preferred_communication: z.enum(['whatsapp', 'email', 'phone']),
  language: z.string(),
  internal_notes: z.string(),
  quickbooks_customer_id: z.string(),
  vat_number: z.string(),
  coc_number: z.string(),
  crib_number: z.string(),
  is_international: z.boolean(),
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
    table_count: (customer as any).table_count != null ? String((customer as any).table_count) : '',
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

  // Billing emails — list of extra email addresses to CC on invoices
  const [billingEmails, setBillingEmails] = useState<string[]>(
    () => defaultValues?.billing_emails ?? []
  )
  const [billingEmailInput, setBillingEmailInput] = useState('')

  // SPika Stands — which stand types the customer has and how many
  const [stands, setStands] = useState<SpikaStand[]>(
    () => (defaultValues as any)?.spika_stands ?? []
  )

  function addStand(type: SpikaStand['type']) {
    setStands(prev => {
      const existing = prev.find(s => s.type === type)
      if (existing) return prev.map(s => s.type === type ? { ...s, qty: s.qty + 1 } : s)
      return [...prev, { type, qty: 1 }]
    })
  }

  function updateStandQty(type: SpikaStand['type'], qty: number) {
    if (qty <= 0) setStands(prev => prev.filter(s => s.type !== type))
    else setStands(prev => prev.map(s => s.type === type ? { ...s, qty } : s))
  }

  function addBillingEmail() {
    const email = billingEmailInput.trim()
    if (!email || billingEmails.includes(email)) return
    setBillingEmails(prev => [...prev, email])
    setBillingEmailInput('')
  }

  function removeBillingEmail(email: string) {
    setBillingEmails(prev => prev.filter(e => e !== email))
  }

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
    table_count: '',
    table_bottle_return_price: 2.50,
    payment_term_days: 7,
    hardcopy_required: false,
    require_delivery_photo: false,
    discount_agreement: '',
    preferred_communication: 'whatsapp',
    language: 'English',
    internal_notes: '',
    quickbooks_customer_id: '',
    vat_number: '',
    coc_number: '',
    crib_number: '',
    is_international: false,
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

    const tableCount = rest.table_count != null && !Number.isNaN(Number(rest.table_count))
      ? Number(rest.table_count)
      : null

    await onSubmit({
      ...rest,
      table_count: tableCount,
      billing_emails: billingEmails,
      spika_stands: stands,
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
  const billingCountry = watch('billing_country')
  const taxIdInfo = getTaxIdInfo(billingCountry ?? '')

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
                  <SelectItem value="supermarket">Supermarket (B2B)</SelectItem>
                  <SelectItem value="shops">Shops (B2B)</SelectItem>
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
              <Label>Primary Email</Label>
              <Input {...register('email')} type="email" placeholder="contact@company.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Billing Emails <span className="text-muted-foreground text-xs font-normal">(invoice CC recipients)</span></Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={billingEmailInput}
                  onChange={e => setBillingEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBillingEmail() } }}
                  placeholder="billing@company.com"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={addBillingEmail}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {billingEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {billingEmails.map(email => (
                    <span key={email} className="flex items-center gap-1 bg-muted text-sm px-2 py-1 rounded-md">
                      {email}
                      <button type="button" onClick={() => removeBillingEmail(email)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">These addresses will receive invoice emails in addition to the primary email.</p>
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
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Tables at customer</Label>
              <Input
                type="number"
                min="0"
                className="h-7 w-20 text-right text-sm"
                {...register('table_count')}
              />
            </div>
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

          {/* SPika Stands */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm font-medium">SPika Stands at Customer</p>
            <p className="text-xs text-muted-foreground">Track which display stands are placed at this customer location.</p>
            <div className="flex flex-wrap gap-2">
              {SPIKA_STAND_TYPES.map(st => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => addStand(st.value)}
                  className="text-xs border rounded-md px-2 py-1 hover:bg-accent transition-colors"
                >
                  + {st.label}
                </button>
              ))}
            </div>
            {stands.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {stands.map(s => {
                  const def = SPIKA_STAND_TYPES.find(st => st.value === s.type)!
                  return (
                    <div key={s.type} className="flex items-center gap-2">
                      <span className="text-sm flex-1">{def.label}</span>
                      <Input
                        type="number"
                        min="0"
                        value={s.qty}
                        onChange={e => updateStandQty(s.type, Number(e.target.value))}
                        className="h-7 w-16 text-right text-sm"
                      />
                      <button type="button" onClick={() => updateStandQty(s.type, 0)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
              <Label>
                {taxIdInfo.label}
                {taxIdInfo.prefix && (
                  <span className="ml-1.5 text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {taxIdInfo.prefix}
                  </span>
                )}
              </Label>
              {taxIdInfo.field === 'vat_number' ? (
                <Input {...register('vat_number')} placeholder={taxIdInfo.placeholder} />
              ) : (
                <Input {...register('crib_number')} placeholder={taxIdInfo.placeholder} />
              )}
              <p className="text-xs text-muted-foreground">
                {taxIdInfo.field === 'vat_number'
                  ? 'Business VAT registration number (for tax-exempt invoicing)'
                  : 'Local customs/tax identification number'}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>CoC Number <span className="text-muted-foreground text-xs">(Kamer van Koophandel)</span></Label>
            <Input {...register('coc_number')} placeholder="e.g. 12345678" />
          </div>
          {/* Show the other tax field only if it already has a value (migration fallback) */}
          {taxIdInfo.field === 'vat_number' && watch('crib_number') && (
            <div className="space-y-1.5">
              <Label>CRIB Number <span className="text-muted-foreground text-xs">(kept from previous entry)</span></Label>
              <Input {...register('crib_number')} placeholder="e.g. 102471812" />
            </div>
          )}
          {taxIdInfo.field === 'crib_number' && watch('vat_number') && (
            <div className="space-y-1.5">
              <Label>VAT Number <span className="text-muted-foreground text-xs">(kept from previous entry)</span></Label>
              <Input {...register('vat_number')} placeholder="e.g. NL123456789B01" />
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">International Customer</p>
              <p className="text-xs text-muted-foreground">Customer receives orders shipped internationally via export</p>
            </div>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  {...register('is_international')}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-red-600 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Term</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                className="h-9 w-24"
                {...register('payment_term_days', { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground">days</span>
              <div className="flex gap-1 ml-2 flex-wrap">
                {[7, 14, 21, 30, 45, 60].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setValue('payment_term_days', d)}
                    className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Days until invoice is due. Shown on delivery notes and invoices.</p>
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
