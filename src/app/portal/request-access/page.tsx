'use client'

import { BrandLockup } from '@/components/brand-mark'
import { useState } from 'react'
import { CheckCircle, ArrowLeft, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Link from 'next/link'

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    company_name: '',
    country: '',
    phone: '',
    message: '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Submits a REQUEST only — no account is created here. An admin reviews it and
  // sends the invite, which is the only path that creates a login.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setLoading(true)
    try {
      const res = await fetch('/api/portal/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setSubmitted(true)
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — form panel */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <BrandLockup height={34} word="SPika" />
            </div>
            <p className="text-muted-foreground text-sm">B2B Customer Portal</p>
          </div>

          {submitted ? (
            <div className="text-center py-8 space-y-4">
              <Mail className="h-14 w-14 text-red-600 mx-auto" />
              <div>
                <p className="font-bold text-xl">Request received!</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Thanks — we&rsquo;ll review your application and get back to you at{' '}
                  <span className="font-medium text-foreground">{form.email}</span>.
                  If approved, you&rsquo;ll receive an invitation to set up your login.
                </p>
              </div>
              <Link href="/portal">
                <Button variant="outline" className="gap-2 mt-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold">Request Access</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Apply for B2B access. We review every request personally and send
                  you a login once approved.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Full name *</Label>
                  <Input
                    placeholder="John Doe"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company name *</Label>
                  <Input
                    placeholder="Your company"
                    value={form.company_name}
                    onChange={e => set('company_name', e.target.value)}
                    required
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
                  <Label>Phone</Label>
                  <Input
                    placeholder="+5999 000 0000"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Anything we should know?</Label>
                  <Input
                    placeholder="Tell us about your business"
                    value={form.message}
                    onChange={e => set('message', e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 h-11"
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Send Request
                </Button>
                <Link href="/portal" className="block text-center text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                  Already have an account? Sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Right — image panel */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden">
        <img
          src="/SPika Portal Launch.jpg.webp"
          alt="SPika Oil"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-10">
          <p className="text-white/80 text-sm uppercase tracking-widest mb-2">Become a reseller</p>
          <h2 className="text-white text-4xl font-bold leading-tight">Join the<br />SPika Network</h2>
          <p className="text-white/70 mt-3 text-sm max-w-xs">
            Apply for a B2B account and get access to our full product range, pricing, and order portal.
          </p>
        </div>
      </div>
    </div>
  )
}
