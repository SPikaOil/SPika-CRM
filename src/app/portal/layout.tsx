'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, ShoppingBag, ClipboardList, LogOut, Loader2, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isCustomer, isLoading, profile, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Redirect staff/admin away from the portal
  useEffect(() => {
    if (!isLoading && session && !isCustomer) {
      router.replace('/dashboard')
    }
  }, [isCustomer, isLoading, session, router])

  useEffect(() => {
    if (!profile?.id) return
    fetch('/api/ping', { method: 'POST' })
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

  // Not authenticated — show customer login
  if (!session) {
    return <PortalLogin />
  }

  // Authenticated as staff — briefly blank while redirect happens
  if (!isCustomer) return null

  const navItems = [
    { href: '/portal', label: 'My Orders', icon: ClipboardList },
    { href: '/portal/new-order', label: 'New Order', icon: ShoppingBag },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 text-red-600" />
            <span className="font-bold text-lg">SPika Oil</span>
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
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                  active ? 'text-red-600' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
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
  const [mode, setMode] = useState<'password' | 'magic'>('magic')
  const [magicSent, setMagicSent] = useState(false)
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
      router.refresh()
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      setMagicSent(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-10 w-10 text-red-600" />
            <span className="font-bold text-3xl tracking-tight">SPika Oil</span>
          </div>
          <p className="text-muted-foreground text-sm">B2B Customer Portal</p>
        </div>

        <div className="bg-background rounded-2xl border shadow-sm p-6 space-y-5">
          {magicSent ? (
            <div className="text-center py-4 space-y-3">
              <Mail className="h-12 w-12 text-red-600 mx-auto" />
              <div>
                <p className="font-semibold">Check your inbox!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a login link to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <button
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                onClick={() => { setMagicSent(false) }}
              >
                Send again
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">Sign in</h2>
                <p className="text-sm text-muted-foreground">
                  Access your orders and place new ones
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted">
                <button
                  type="button"
                  onClick={() => setMode('magic')}
                  className={cn(
                    'flex-1 text-sm py-1.5 rounded-md font-medium transition-colors',
                    mode === 'magic'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Magic Link
                </button>
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className={cn(
                    'flex-1 text-sm py-1.5 rounded-md font-medium transition-colors',
                    mode === 'password'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Password
                </button>
              </div>

              {mode === 'magic' ? (
                <form onSubmit={handleMagicLink} className="space-y-4">
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
                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 h-11"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Send Login Link
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    We'll email you a one-click login link — no password needed.
                  </p>
                </form>
              ) : (
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
                    <Label>Password</Label>
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
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
