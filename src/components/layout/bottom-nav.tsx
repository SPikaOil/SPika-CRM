'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'

const adminNavItems = [
  { href: '/dashboard',      label: 'Home',    icon: LayoutDashboard },
  { href: '/customers',      label: 'Customers', icon: Users },
  { href: '/delivery-notes', label: 'Notes',   icon: FileText },
  { href: '/orders',         label: 'Orders',  icon: ShoppingCart },
  { href: '/agenda',         label: 'Agenda',  icon: CalendarDays },
]

const salesNavItems = [
  { href: '/dashboard',      label: 'Home',    icon: LayoutDashboard },
  { href: '/delivery-notes', label: 'Notes',   icon: FileText },
  { href: '/agenda',         label: 'Agenda',  icon: CalendarDays },
]

export function BottomNav() {
  const pathname = usePathname()
  const { isAdmin } = useAuth()
  const navItems = isAdmin ? adminNavItems : salesNavItems

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-area-pb">
      <div className="flex">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
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
  )
}
