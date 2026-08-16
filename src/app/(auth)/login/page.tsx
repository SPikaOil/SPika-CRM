'use client'

import { useState } from 'react'
import { BrandLockup } from '@/components/brand-mark'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Password only. Magic link was removed on 2026-07-25: it was a second way in
// that needed nothing but access to an inbox, and it created an account for any
// unknown address. Accounts are handed out by an admin, so a passwordless door
// buys nothing here.
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  // Second step, when this account has one. Supabase signs you in on the
  // password alone but marks the session "aal1"; the account is not really open
  // until a code lifts it to "aal2". Without this screen a person who turns on
  // two-step verification can never finish signing in again.
  const [needsCode, setNeedsCode] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function onLogin(data: LoginForm) {
    const { error } = await supabase.auth.signInWithPassword(data)
    if (error) {
      toast.error(error.message)
      return
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = (factors?.totp ?? []).find(f => f.status === 'verified')
      if (totp) {
        setFactorId(totp.id)
        setNeedsCode(true)
        return
      }
    }

    toast.success('Signed in!')
    router.push('/dashboard')
    router.refresh()
  }

  async function verifyCode() {
    if (!factorId || code.trim().length < 6) return
    setVerifying(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() })
      if (error) throw error
      toast.success('Signed in!')
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('That code did not work. Use the code showing right now.')
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* This screen is the reference: the ratios inside BrandLockup were
            measured here against the real artwork. Every other screen uses
            the same component so the treatment cannot drift. */}
        <BrandLockup height={96} word="SPika" strapline="Sales, Marketing & more" />

        {needsCode ? (
          <Card>
            <CardHeader>
              <CardTitle>Enter your code</CardTitle>
              <CardDescription>
                Open your authenticator app and type the six-digit code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="h-12 text-center text-2xl tracking-[0.4em]"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') verifyCode() }}
              />
              <Button
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={verifying || code.length < 6}
                onClick={verifyCode}
              >
                {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Continue
              </Button>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Accounts are issued by an administrator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@spika.com"
                  autoComplete="email"
                  {...loginForm.register('email')}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...loginForm.register('password')}
                />
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={loginForm.formState.isSubmitting}
              >
                {loginForm.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}
