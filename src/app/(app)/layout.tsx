'use client'

import { useEffect } from 'react'
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
    if (!pathname.startsWith('/marketing')) router.replace('/marketing')
  }, [isLoading, profile?.role, pathname, router])

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
