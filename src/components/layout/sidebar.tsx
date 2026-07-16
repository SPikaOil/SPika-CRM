'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  Settings,
  Flame,
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { UserMenu } from './user-menu'

const allNavItems = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, adminOnly: false },
  { href: '/customers',       label: 'Customers',        icon: Users,           adminOnly: true  },
  { href: '/quotations',      label: 'Quotations',       icon: ReceiptText,     adminOnly: true  },
  { href: '/delivery-notes',  label: 'Delivery Notes',   icon: FileText,        adminOnly: false },
  { href: '/orders',          label: 'Orders',           icon: ShoppingCart,    adminOnly: true  },
  { href: '/products',         label: 'Products',         icon: Package,         adminOnly: true  },
  { href: '/sales-documents', label: 'Sales Docs',       icon: FolderOpen,      adminOnly: true  },
  { href: '/tasks',           label: 'Tasks',            icon: ClipboardList,   adminOnly: true  },
  { href: '/agenda',          label: 'Agenda',           icon: CalendarDays,    adminOnly: false },
  { href: '/reports',         label: 'Reports',          icon: BarChart2,       adminOnly: true  },
  { href: '/stock',           label: 'Stock SPika',      icon: Droplets,        adminOnly: true  },
  { href: '/handover',        label: 'Handover Btls',    icon: PackageCheck,    adminOnly: false },
  { href: '/store-locator',   label: 'Store Locator',    icon: MapPin,          adminOnly: true  },
]

const adminOnlyItems = [
  { href: '/portal-management', label: 'Portal',   icon: Globe    },
  { href: '/team',              label: 'Team',     icon: UserCog  },
  { href: '/settings',          label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin } = useAuth()

  const navItems = allNavItems.filter(i => isAdmin || !i.adminOnly)

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r bg-background h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <Flame className="h-7 w-7 text-red-600" />
        <span className="font-bold text-xl tracking-tight">SPika CRM</span>
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
