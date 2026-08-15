'use client'

import { BrandLockup } from '@/components/brand-mark'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

const BUSINESS_TYPES = [
  'Retailer',
  'Wholesaler',
  'Restaurant/Café',
  'Hotel',
  'Supermarket',
  'Fuel station',
  'Other',
]

const PRODUCTS = [
  'Hot Sauce',
  'Cooking Oil',
  'Seasoning/Spices',
  'Other SPika products',
]

const MONTHLY_VOLUMES = [
  'Under 50L',
  '50–200L',
  '200–500L',
  '500L+',
  "I'm not sure yet",
]

const REFERRAL_SOURCES = [
  'Social media',
  'Trade show/event',
  'Word of mouth',
  'Google search',
  'Distributor/Agent',
  'Other',
]

export default function OnboardingPage() {
  const { supabaseUser } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const meta = supabaseUser?.user_metadata ?? {}

  const [form, setForm] = useState({
    // Step 1
    business_type: '',
    address: '',
    city: '',
    zip: '',
    country: (meta.country as string) ?? '',
    phone: '',
    whatsapp: '',
    vat_number: '',
    crib_number: '',
    coc_number: '',
    website: '',
    // Step 2
    products: [] as string[],
    monthly_volume: '',
    referral_source: '',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleProduct(product: string) {
    setForm(prev => ({
      ...prev,
      products: prev.products.includes(product)
        ? prev.products.filter(p => p !== product)
        : [...prev.products, product],
    }))
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (!form.business_type || !form.address || !form.city || !form.country || !form.phone) {
      toast.error('Please fill in all required fields')
      return
    }
    setStep(2)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.monthly_volume || !form.referral_source) {
      toast.error('Please fill in all required fields')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      router.replace('/portal/pending')
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const isCuracao = form.country.toLowerCase().includes('cura')

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-2">
            <BrandLockup height={34} word="SPika" />
          </div>
          <p className="text-muted-foreground text-sm">B2B Partner Application</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center">
          <div className={`h-2 w-16 rounded-full transition-colors ${step >= 1 ? 'bg-red-600' : 'bg-muted'}`} />
          <div className={`h-2 w-16 rounded-full transition-colors ${step >= 2 ? 'bg-red-600' : 'bg-muted'}`} />
          <span className="text-xs text-muted-foreground ml-1">{step}/2</span>
        </div>

        <Card>
          <CardContent className="pt-6 pb-6">
            {step === 1 ? (
              <form onSubmit={handleNext} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Business Details</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Tell us about your business</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Business type *</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={form.business_type}
                    onChange={e => set('business_type', e.target.value)}
                    required
                  >
                    <option value="">Select a type...</option>
                    {BUSINESS_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Street address *</Label>
                  <Input
                    placeholder="123 Main Street"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>City *</Label>
                  <Input
                    placeholder="Willemstad"
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Zip / Postal code <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="0000"
                    value={form.zip}
                    onChange={e => set('zip', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Country *</Label>
                  <Input
                    placeholder="Curaçao"
                    value={form.country}
                    onChange={e => set('country', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input
                    placeholder="+5999 000 0000"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>WhatsApp <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="+5999 000 0000 (leave blank if same as phone)"
                    value={form.whatsapp}
                    onChange={e => set('whatsapp', e.target.value)}
                  />
                </div>

                {isCuracao ? (
                  <div className="space-y-1.5">
                    <Label>CRIB Number <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      placeholder="102471812"
                      value={form.crib_number}
                      onChange={e => set('crib_number', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Required for Curaçao businesses</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>VAT / Tax number <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      placeholder="NL123456789B01"
                      value={form.vat_number}
                      onChange={e => set('vat_number', e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>CoC / KVK Number <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="e.g. 12345678"
                    value={form.coc_number}
                    onChange={e => set('coc_number', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Website <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="https://yourcompany.com"
                    value={form.website}
                    onChange={e => set('website', e.target.value)}
                  />
                </div>

                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 h-11">
                  Next →
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Commercial Info</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Help us understand your needs</p>
                </div>

                <div className="space-y-2">
                  <Label>Products of interest *</Label>
                  <div className="space-y-2">
                    {PRODUCTS.map(product => (
                      <label key={product} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-red-600"
                          checked={form.products.includes(product)}
                          onChange={() => toggleProduct(product)}
                        />
                        <span className="text-sm">{product}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Estimated monthly order volume *</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={form.monthly_volume}
                    onChange={e => set('monthly_volume', e.target.value)}
                    required
                  >
                    <option value="">Select volume...</option>
                    {MONTHLY_VOLUMES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>How did you hear about SPika? *</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={form.referral_source}
                    onChange={e => set('referral_source', e.target.value)}
                    required
                  >
                    <option value="">Select...</option>
                    {REFERRAL_SOURCES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Additional notes <span className="text-muted-foreground">(optional)</span></Label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[80px] resize-none"
                    placeholder="Anything else you'd like us to know..."
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => setStep(1)}
                    disabled={loading}
                  >
                    ← Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 h-11"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Submit Application
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
