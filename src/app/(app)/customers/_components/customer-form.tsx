'use client'

import { useState, useRef, useEffect } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Customer, SpikaStand, SPIKA_STAND_TYPES } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getTaxIdInfo } from '@/lib/tax-id'
import { useCustomers } from '@/hooks/use-customers'
import { usePricePresets } from '@/hooks/use-price-presets'
import { PriceInput } from '@/components/ui/price-input'

const customerSchema = z.object({
  company_name: z.string().min(1, 'Required'),
  customer_category: z.string().min(1, 'Required'),
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
  display_as: z.string(),
  shops_sold_at: z.string(),
  storelocator: z.boolean(),
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
    storelocator: customer.storelocator ?? false,
    display_as: customer.display_as ?? '',
    shops_sold_at: customer.shops_sold_at ?? '',
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
  const { data: allCustomers } = useCustomers()
  const { data: pricePresets } = usePricePresets()

  // Track the category the user just selected so we can apply its preset
  // even if pricePresets hasn't loaded yet at the time of selection.
  const pendingPresetCategory = useRef<string | null>(null)
  const isInitialRender = useRef(true)

  function applyPreset(categoryKey: string, presets: typeof pricePresets) {
    const preset = presets?.find(p => p.category === categoryKey)
    if (!preset) return
    const activeSkus = (preset.products ?? []).length > 0
      ? preset.products
      : SPIKA_PRODUCTS.map(p => p.sku)
    setProductPrices(prev => {
      const next = { ...prev }
      for (const p of SPIKA_PRODUCTS) {
        if (activeSkus.includes(p.sku) && preset.prices[p.sku] !== undefined) {
          next[p.sku] = preset.prices[p.sku]
        }
      }
      return next
    })
    setProductDiscounts(prev => {
      const next = { ...prev }
      for (const p of SPIKA_PRODUCTS) {
        if (activeSkus.includes(p.sku)) {
          next[p.sku] = (preset.discounts ?? {})[p.sku] ?? 0
        }
      }
      return next
    })
  }

  // When pricePresets finally loads, apply any preset that was selected before data arrived
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    const cat = pendingPresetCategory.current
    if (!cat || !pricePresets) return
    pendingPresetCategory.current = null
    applyPreset(cat, pricePresets)
  }, [pricePresets])

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

  // Same billing/delivery address toggle
  const [sameAddress, setSameAddress] = useState<boolean>(() => {
    if (!defaultValues?.id) return true // new customer → default same
    const b = defaultValues.billing_address as any
    const d = defaultValues.delivery_address as any
    if (!b?.street && !d?.street) return true
    return (
      (b?.street ?? '') === (d?.street ?? '') &&
      (b?.city ?? '') === (d?.city ?? '') &&
      (b?.zip ?? '') === (d?.zip ?? '') &&
      (b?.country ?? '') === (d?.country ?? '')
    )
  })

  // Active products — which products this customer actually orders
  // Default: if existing customer has active_products set, use those;
  //          if new customer (no defaultValues), start with nothing selected
  //          if existing customer has no active_products yet (legacy), include all
  const [activeProducts, setActiveProducts] = useState<Set<string>>(() => {
    const existing = defaultValues?.active_products
    if (existing && existing.length > 0) return new Set(existing)
    if (!defaultValues?.id) return new Set() // new customer → nothing pre-selected
    return new Set(SPIKA_PRODUCTS.map(p => p.sku)) // legacy customer → all active
  })

  function toggleActiveProduct(sku: string) {
    setActiveProducts((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  function toggleAllProducts(checked: boolean) {
    setActiveProducts(checked ? new Set(SPIKA_PRODUCTS.map(p => p.sku)) : new Set())
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
    display_as: '',
    shops_sold_at: '',
    storelocator: false,
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
      active_products: Array.from(activeProducts),
      billing_address: {
        street: billing_street,
        city: billing_city,
        state: '',
        zip: billing_zip,
        country: billing_country,
      },
      delivery_address: sameAddress ? {
        street: billing_street,
        city: billing_city,
        state: '',
        zip: billing_zip,
        country: billing_country,
      } : {
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
  const companyName = watch('company_name') ?? ''

  const vatNumber = watch('vat_number') ?? ''
  const cribNumber = watch('crib_number') ?? ''
  const cocNumber = watch('coc_number') ?? ''

  function dupWarning(matches: Customer[]) {
    if (matches.length === 0) return null
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-2.5 space-y-1.5">
        <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
          ⚠️ Already used by another customer
        </p>
        {matches.map(c => (
          <a key={c.id} href={`/customers/${c.id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between text-xs text-orange-700 dark:text-orange-400 hover:underline">
            <span className="font-medium">{c.company_name}</span>
            <span className="text-orange-500 capitalize">{c.customer_category} →</span>
          </a>
        ))}
        <p className="text-xs text-orange-600/70">Check if this is already in the system before saving.</p>
      </div>
    )
  }

  // Live duplicate detection — only flag exact name matches (case-insensitive)
  const duplicates = (allCustomers ?? []).filter(c => {
    if (defaultValues?.id && c.id === defaultValues.id) return false
    return c.company_name.toLowerCase().trim() === companyName.toLowerCase().trim()
  }).filter(() => companyName.trim().length >= 2)

  const vatDuplicates = vatNumber.trim().length >= 5
    ? (allCustomers ?? []).filter(c => {
        if (defaultValues?.id && c.id === defaultValues.id) return false
        return c.vat_number?.trim() && c.vat_number.trim().toLowerCase() === vatNumber.trim().toLowerCase()
      })
    : []

  const cribDuplicates = cribNumber.trim().length >= 5
    ? (allCustomers ?? []).filter(c => {
        if (defaultValues?.id && c.id === defaultValues.id) return false
        return c.crib_number?.trim() && c.crib_number.trim() === cribNumber.trim()
      })
    : []

  const cocDuplicates = cocNumber.trim().length >= 4
    ? (allCustomers ?? []).filter(c => {
        if (defaultValues?.id && c.id === defaultValues.id) return false
        return c.coc_number?.trim() && c.coc_number.trim() === cocNumber.trim()
      })
    : []

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 group-data-horizontal/tabs:h-auto gap-1">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        {/* ── Tab: Info ── */}
        <TabsContent value="info" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input {...register('company_name')} placeholder="Acme Restaurants" />
                {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
                {duplicates.length > 0 && dupWarning(duplicates)}
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={category} onValueChange={(v) => {
                  setValue('customer_category', v as any)
                  if (pricePresets) {
                    applyPreset(v, pricePresets)
                  } else {
                    // pricePresets not loaded yet — apply once they arrive
                    pendingPresetCategory.current = v
                  }
                }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(pricePresets ?? []).map(p => (
                      <SelectItem key={p.category} value={p.category}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {category === 'b2c' ? '6% tax applies (B2C)' : '0% tax — tax-exempt B2B customer'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Display As <span className="text-muted-foreground text-xs font-normal">(used on website/store locator)</span></Label>
                <Input {...register('display_as')} placeholder="e.g. Steak House Willemstad" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contact Person</Label>
                  <Input {...register('contact_person')} placeholder="John Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setValue('status', v as any)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Contact Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input {...register('phone')} placeholder="+1 555 000 0000" />
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp</Label>
                  <Input {...register('whatsapp')} placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Primary Email</Label>
                <Input {...register('email')} type="email" placeholder="contact@company.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Billing Emails <span className="text-muted-foreground text-xs font-normal">(CC on invoices)</span></Label>
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Preferred Contact</Label>
                  <Select value={preferredComm} onValueChange={(v) => setValue('preferred_communication', v as any)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
        </TabsContent>

        {/* ── Tab: Address ── */}
        <TabsContent value="address" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Address</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Street</Label>
                  <Input {...register('billing_street')} placeholder="123 Main St" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input {...register('billing_city')} placeholder="Amsterdam" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Zip Code</Label>
                    <Input {...register('billing_zip')} placeholder="1234 AB" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Input {...register('billing_country')} placeholder="Netherlands" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={sameAddress}
                  onChange={e => setSameAddress(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Delivery address is the same as billing</span>
              </label>

              {!sameAddress && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2 border-t">Delivery Address</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Street</Label>
                      <Input {...register('delivery_street')} placeholder="123 Main St" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>City</Label>
                        <Input {...register('delivery_city')} placeholder="Amsterdam" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Zip Code</Label>
                        <Input {...register('delivery_zip')} placeholder="1234 AB" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Country</Label>
                      <Input {...register('delivery_country')} placeholder="Netherlands" />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Settings ── */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Delivery Time Window</Label>
                <Input {...register('delivery_time_window')} placeholder="09:00-17:00" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('ob_form_required')} className="rounded" />
                  <span className="text-sm">OB Form Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('packing_slip_required')} className="rounded" />
                  <span className="text-sm">Packing Slip Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('hardcopy_required')} className="rounded" />
                  <span className="text-sm font-medium text-orange-600">🖨️ Hard Copy Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('require_delivery_photo')} className="rounded" />
                  <span className="text-sm font-medium text-blue-600">📷 Delivery Photo Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('track_table_bottles')} className="rounded" />
                  <span className="text-sm">Track Table Bottles</span>
                </label>
                <div className="flex items-center gap-3 pl-6">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Tables at customer</Label>
                  <Input type="number" min="0" className="h-7 w-20 text-right text-sm" {...register('table_count')} />
                </div>
                <div className="flex items-center gap-3 pl-6">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Return price (XCG)</Label>
                  <Input type="number" step="0.01" min="0" className="h-7 w-24 text-right text-sm" {...register('table_bottle_return_price', { valueAsNumber: true })} />
                </div>
              </div>

              {/* SPika Stands */}
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium">SPika Stands at Customer</p>
                <div className="flex flex-wrap gap-2">
                  {SPIKA_STAND_TYPES.map(st => (
                    <button key={st.value} type="button" onClick={() => addStand(st.value)}
                      className="text-xs border rounded-md px-2 py-1 hover:bg-accent transition-colors">
                      + {st.label}
                    </button>
                  ))}
                </div>
                {stands.length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    {stands.map(s => {
                      const def = SPIKA_STAND_TYPES.find(st => st.value === s.type)!
                      return (
                        <div key={s.type} className="flex items-center gap-2">
                          <span className="text-sm flex-1">{def.label}</span>
                          <Input type="number" min="0" value={s.qty}
                            onChange={e => updateStandQty(s.type, Number(e.target.value))}
                            className="h-7 w-16 text-right text-sm" />
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
                  {taxIdInfo.field === 'vat_number'
                    ? <Input {...register('vat_number')} placeholder={taxIdInfo.placeholder} />
                    : <Input {...register('crib_number')} placeholder={taxIdInfo.placeholder} />
                  }
                  {taxIdInfo.field === 'vat_number' && dupWarning(vatDuplicates)}
                  {taxIdInfo.field === 'crib_number' && dupWarning(cribDuplicates)}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>CoC / KVK Number</Label>
                <Input {...register('coc_number')} placeholder="e.g. 12345678" />
                {dupWarning(cocDuplicates)}
              </div>
              {taxIdInfo.field === 'vat_number' && watch('crib_number') && (
                <div className="space-y-1.5">
                  <Label>CRIB Number</Label>
                  <Input {...register('crib_number')} placeholder="e.g. 102471812" />
                </div>
              )}
              {taxIdInfo.field === 'crib_number' && watch('vat_number') && (
                <div className="space-y-1.5">
                  <Label>VAT Number</Label>
                  <Input {...register('vat_number')} placeholder="e.g. NL123456789B01" />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">International Customer</p>
                  <p className="text-xs text-muted-foreground">Ships internationally via export</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" {...register('is_international')} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-red-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Term</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="number" min="1" className="h-9 w-20" {...register('payment_term_days', { valueAsNumber: true })} />
                  <span className="text-sm text-muted-foreground">days</span>
                  <div className="flex gap-1 flex-wrap">
                    {[7, 14, 21, 30, 45, 60].map(d => (
                      <button key={d} type="button" onClick={() => setValue('payment_term_days', d)}
                        className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors">
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Discount Agreement</Label>
                <Input {...register('discount_agreement')} placeholder="e.g. 10% on orders >500" />
              </div>
              <div className="space-y-1.5">
                <Label>QuickBooks ID</Label>
                <Input {...register('quickbooks_customer_id')} placeholder="QB-123" />
              </div>
              <div className="space-y-1.5">
                <Label>Internal Notes</Label>
                <Textarea {...register('internal_notes')} placeholder="Any internal notes..." rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Store Locator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Shops sold at</Label>
                <Textarea {...register('shops_sold_at')} placeholder="e.g. Jumbo Willemstad, MCD Punda, ..." rows={3} />
                <p className="text-xs text-muted-foreground">List the shop locations where SPika products are sold by this customer.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">🗺️ Storelocator?</p>
                  <p className="text-xs text-muted-foreground">Include this customer on the website store locator</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" {...register('storelocator')} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-red-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Products ── */}
        <TabsContent value="products" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products & Pricing</CardTitle>
              <p className="text-xs text-muted-foreground">
                Tick the products this customer orders. Only active products appear on delivery notes.
              </p>
            </CardHeader>
            <CardContent className="space-y-0 p-0 sm:p-6 sm:pt-0">
              {/* Desktop header */}
              <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center pb-1.5 border-b mb-1 px-6 sm:px-0">
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" checked={activeProducts.size === SPIKA_PRODUCTS.length}
                    onChange={e => toggleAllProducts(e.target.checked)} className="rounded" />
                </label>
                <span className="text-xs text-muted-foreground font-medium">Product</span>
                <span className="text-xs text-muted-foreground w-20 text-center">Price (XCG)</span>
                <span className="text-xs text-muted-foreground w-20 text-center">Discount</span>
                <span className="text-xs text-muted-foreground w-10 text-center">Free</span>
              </div>

              {/* Mobile: "select all" */}
              <div className="sm:hidden flex items-center gap-2 px-4 py-2 border-b">
                <input type="checkbox" checked={activeProducts.size === SPIKA_PRODUCTS.length}
                  onChange={e => toggleAllProducts(e.target.checked)} className="rounded" />
                <span className="text-xs text-muted-foreground">Select all products</span>
                <span className="ml-auto text-xs text-muted-foreground">{activeProducts.size}/{SPIKA_PRODUCTS.length} active</span>
              </div>

              {SPIKA_PRODUCTS.map((product) => {
                const isActive = activeProducts.has(product.sku)
                const isFree = freeProducts.has(product.sku)
                return (
                  <div key={product.sku} className={`transition-opacity ${isActive ? '' : 'opacity-40'}`}>
                    {/* Mobile layout */}
                    <div className="sm:hidden px-4 py-3 border-b last:border-0 space-y-2">
                      {/* Row 1: checkbox + product name */}
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={isActive} onChange={() => toggleActiveProduct(product.sku)} className="rounded cursor-pointer shrink-0" />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium leading-tight ${isActive ? '' : 'line-through text-muted-foreground'}`}>{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.sku}</p>
                        </div>
                      </div>
                      {/* Row 2: price · discount · free */}
                      <div className="flex items-end gap-2 pl-6">
                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-muted-foreground">Price (XCG)</p>
                          <PriceInput
                            value={productPrices[product.sku] ?? product.default_price}
                            onChange={v => setProductPrices(prev => ({ ...prev, [product.sku]: v }))}
                            placeholder={product.default_price.toFixed(2)}
                            className="h-8 text-sm"
                            disabled={!isActive || isFree} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-muted-foreground">Discount</p>
                          <PriceInput
                            value={productDiscounts[product.sku] ?? 0}
                            onChange={v => setProductDiscounts(prev => ({ ...prev, [product.sku]: v }))}
                            placeholder="0.00"
                            className="h-8 text-sm"
                            disabled={!isActive || isFree} />
                        </div>
                        <label className="flex flex-col items-center gap-1 pb-1 shrink-0">
                          <p className="text-xs text-muted-foreground">Free</p>
                          <input type="checkbox" checked={isFree} onChange={() => toggleFreeProduct(product.sku)} disabled={!isActive} className="rounded cursor-pointer accent-green-600 h-4 w-4" />
                        </label>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center py-2.5 border-b last:border-0">
                      <input type="checkbox" checked={isActive} onChange={() => toggleActiveProduct(product.sku)} className="rounded cursor-pointer" />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? '' : 'line-through text-muted-foreground'}`}>{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku} · default XCG {product.default_price.toFixed(2)}</p>
                      </div>
                      <div className="w-20">
                        <PriceInput
                          value={productPrices[product.sku] ?? product.default_price}
                          onChange={v => setProductPrices(prev => ({ ...prev, [product.sku]: v }))}
                          placeholder={product.default_price.toFixed(2)}
                          className="h-8"
                          disabled={!isActive || isFree} />
                      </div>
                      <div className="w-20">
                        <PriceInput
                          value={productDiscounts[product.sku] ?? 0}
                          onChange={v => setProductDiscounts(prev => ({ ...prev, [product.sku]: v }))}
                          placeholder="0.00"
                          className="h-8"
                          disabled={!isActive || isFree} />
                      </div>
                      <div className="w-10 flex justify-center">
                        <input type="checkbox" checked={isFree} onChange={() => toggleFreeProduct(product.sku)} disabled={!isActive} className="rounded cursor-pointer accent-green-600" />
                      </div>
                    </div>
                  </div>
                )
              })}

              <p className="hidden sm:block text-xs text-muted-foreground pt-2">
                {activeProducts.size} of {SPIKA_PRODUCTS.length} products active for this customer
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={isLoading}>
        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save Customer
      </Button>
    </form>
  )
}
