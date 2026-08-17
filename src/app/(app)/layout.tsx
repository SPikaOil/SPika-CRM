'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { useAuth } from '@/contexts/auth-context'
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isCustomer, isLoading, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Update last_seen_at whenever the user is active in the app
  useEffect(() => {
    if (!profile?.id) return
    fetch('/api/ping', { method: 'POST' })
  }, [profile?.id])

  useEffect(() => {
    if (!isLoading && isCustomer) {
      router.replace('/portal')
    }
  }, [isCustomer, isLoading, router])

  // Marketing has one job and one tab. The dashboard is open to everyone signed
  // in, and for this role it would only ever render empty boxes — the database
  // refuses them orders and customers. Send them where their work is instead.
  useEffect(() => {
    if (isLoading || profile?.role !== 'marketing') return
    // The screens this role is allowed on. Anything else — the dashboard,
    // customers, orders — would render empty boxes anyway, because the database
    // refuses them the data. Sending them back is kinder than showing that.
    //
    // /tasks is on the list because every internal role holds tasks.create
    // since migration 081 — anyone may report something that needs doing, and
    // an admin allocates it. Without it the sidebar would show a Tasks button
    // that bounced this role straight back here.
    const allowed = ['/marketing', '/products', '/store-locator', '/tasks', '/security']
    if (!allowed.some(p => pathname.startsWith(p))) router.replace('/marketing')
  }, [isLoading, profile?.role, pathname, router])

  // Two-step verification the admin has required but this person has not set up.
  // Park them on /security until they have. Checked against the LIVE factor list
  // rather than a stored flag, so turning it on takes effect immediately and
  // turning it off never leaves someone stuck.
  const [mfaBlocked, setMfaBlocked] = useState(false)
  useEffect(() => {
    if (isLoading || !profile?.mfa_required) { setMfaBlocked(false); return }
    let cancelled = false
    createClient().auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return
      const enrolled = (data?.totp ?? []).some(f => f.status === 'verified')
      setMfaBlocked(!enrolled)
      if (!enrolled && !pathname.startsWith('/security')) router.replace('/security')
    })
    return () => { cancelled = true }
  }, [isLoading, profile?.mfa_required, pathname, router])

  if (isCustomer) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col min-h-screen pb-16 lg:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
