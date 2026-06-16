'use client'

import { useState } from 'react'
import { Flame, CheckCircle, ArrowLeft, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    company_name: '',
    country: '',
    password: '',
    confirm_password: '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match')
      return
    }

    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            name: form.name,
            company_name: form.company_name,
            country: form.country,
          },
          emailRedirectTo: window.location.origin + '/portal/onboarding',
        },
      })
      if (error) throw error
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
              <Flame className="h-8 w-8 text-red-600" />
              <span className="font-bold text-2xl tracking-tight">SPika Oil</span>
            </div>
            <p className="text-muted-foreground text-sm">B2B Customer Portal</p>
          </div>

          {submitted ? (
            <div className="text-center py-8 space-y-4">
              <Mail className="h-14 w-14 text-red-600 mx-auto" />
              <div>
                <p className="font-bold text-xl">Check your email!</p>
                <p className="text-sm text-muted-foreground mt-2">
                  We sent a verification link to{' '}
                  <span className="font-medium text-foreground">{form.email}</span>.
                  Click the link to verify your address and complete your application.
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
                <h1 className="text-2xl font-bold">Create Account</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Register to apply for B2B access.
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
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm password *</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.confirm_password}
                    onChange={e => set('confirm_password', e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                  {form.confirm_password && form.password !== form.confirm_password && (
                    <p className="text-xs text-red-600">Passwords do not match</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 h-11"
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
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
