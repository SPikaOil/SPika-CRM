'use client'

import { BrandLockup } from '@/components/brand-mark'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, ClipboardList, LogOut, Loader2, Mail, KeyRound, LayoutDashboard, FileText, BookOpen, HeadphonesIcon, UserCircle, Megaphone } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// Internal team roles belong in the CRM, never in the customer portal.
// One shared list — see the note in lib/permissions.ts for why.
import { INTERNAL_ROLES } from '@/lib/permissions'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isCustomer, isLoading, profile, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  // Exchange PKCE code for session if present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(() => {
      // Remove code from URL then refresh auth state
      const url = new URL(window.location.href)
      url.searchParams.delete('code')
      window.history.replaceState({}, '', url.toString())
      router.refresh()
    })
  }, [router])

  // Redirect staff/admin away from the portal; route prospects to pending/onboarding
  useEffect(() => {
    if (isLoading) return
    if (!session) return
    const role = profile?.role
    if (role && INTERNAL_ROLES.includes(role) ) {
      router.replace('/dashboard')
      return
    }
    if (!isCustomer) {
      if (role === 'prospect') {
        if (pathname !== '/portal/pending') router.replace('/portal/pending')
      } else if (!profile) {
        if (pathname !== '/portal/onboarding') router.replace('/portal/onboarding')
      }
    }
  }, [isLoading, session, isCustomer, profile, pathname, router])

  useEffect(() => {
    if (!profile?.id) return
    fetch('/api/ping', { method: 'POST' })
    fetch('/api/portal/confirm', { method: 'POST' })
  }, [profile?.id])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/portal')
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  // Not authenticated — allow request-access page through, show login for everything else
  if (!session) {
    if (pathname === '/portal/request-access') return <>{children}</>
    return <PortalLogin />
  }

  // Internal staff — blank while redirecting to /dashboard
  if (profile?.role && INTERNAL_ROLES.includes(profile.role) ) return null

  // Prospect or new user — pass through to onboarding/pending (those pages handle their own layout)
  if (!isCustomer) return <>{children}</>

  const navItems = [
    { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/portal/orders', label: 'Orders', icon: ClipboardList },
    { href: '/portal/catalogue', label: 'Products', icon: BookOpen },
    { href: '/portal/marketing', label: 'Marketing', icon: Megaphone },
    { href: '/portal/invoices', label: 'Invoices', icon: FileText },
    { href: '/portal/support', label: 'Support', icon: HeadphonesIcon },
    { href: '/portal/account', label: 'Account', icon: UserCircle },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLockup height={26} word="SPika" />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground hidden sm:block">{profile?.name}</p>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== '/portal/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors',
                  active ? 'text-red-600' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[10px] font-medium leading-tight text-center h-6 flex items-center justify-center px-0.5">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      router.push('/portal/dashboard')
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error('Enter your email address first')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal`,
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — login panel */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-6">
          {/* Brand */}
          <div className="flex flex-col items-start gap-1 mb-2">
            <div className="flex items-center gap-2">
              <BrandLockup height={34} word="SPika" />
            </div>
            <p className="text-muted-foreground text-sm">B2B Customer Portal</p>
          </div>

          {resetSent ? (
            <div className="text-center py-8 space-y-3">
              <Mail className="h-12 w-12 text-red-600 mx-auto" />
              <div>
                <p className="font-semibold text-lg">Check your inbox!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a password reset link to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <button
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                onClick={() => setResetSent(false)}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold">Sign in</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Access your orders and place new ones
                </p>
              </div>

                <form onSubmit={handlePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Password</Label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 h-11"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Sign In
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    No account yet?{' '}
                    <Link href="/portal/request-access" className="text-foreground underline underline-offset-4 hover:text-red-600">
                      Request access
                    </Link>
                  </p>
                </form>
            </>
          )}
        </div>
      </div>

      {/* Right — SPika image panel (hidden on mobile) */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden">
        <img
          src="/SPika Portal Launch.jpg.webp"
          alt="SPika Oil"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Overlay with brand text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-10">
          <p className="text-white/80 text-sm uppercase tracking-widest mb-2">Welcome to</p>
          <h2 className="text-white text-4xl font-bold leading-tight">SPika Oil<br />B2B Portal</h2>
          <p className="text-white/70 mt-3 text-sm max-w-xs">
            Order fuel products, track deliveries, and manage your account — all in one place.
          </p>
        </div>
      </div>
    </div>
  )
}
