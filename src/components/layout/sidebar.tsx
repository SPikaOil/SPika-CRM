'use client'

import { BrandLockup } from '@/components/brand-mark'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  Settings,

  ClipboardList,
  CalendarDays,
  UserCog,
  ReceiptText,
  Package,
  FolderOpen,
  Globe,
  BarChart2,
  Droplets,
  PackageCheck,
  MapPin,
  Sprout,
  Mail,
  ShieldCheck,
  Ship,
  Warehouse,
  Megaphone,
  CalendarRange,
  Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { UserMenu } from './user-menu'
import { visibleNav } from '@/lib/navigation'

// The list lives in lib/navigation.ts, shared with the phone. There used to be
// one here and another in bottom-nav.tsx, and Warehouse only ever made it into
// this one — so on a phone that tab did not exist. One source now.

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin, can } = useAuth()

  const navItems = visibleNav(can, isAdmin).filter(i => !i.adminOnly && i.href !== '/settings'
    && !['/portal-management', '/team', '/permissions', '/email-preview'].includes(i.href))
  const adminOnlyItems = visibleNav(can, isAdmin).filter(i => i.adminOnly
    || ['/portal-management', '/team', '/permissions', '/email-preview', '/settings'].includes(i.href))

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r bg-background h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <BrandLockup height={30} word="SPika CRM" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-red-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {isAdmin && (
          <>
            <div className="my-3 border-t" />
            {adminOnlyItems.map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-red-600 text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <UserMenu />
      </div>
    </aside>
  )
}
