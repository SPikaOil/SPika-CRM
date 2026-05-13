'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { useAuth } from '@/contexts/auth-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isCustomer, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isCustomer) {
      router.replace('/portal')
    }
  }, [isCustomer, isLoading, router])

  if (isCustomer) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen pb-16 lg:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
