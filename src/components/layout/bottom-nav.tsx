'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  CalendarDays,
  MoreHorizontal,
  ClipboardList,
  ReceiptText,
  Settings,
  UserCog,
  X,
  Package,
  FolderOpen,
  Globe,
  LogOut,
  BarChart2,
  Droplets,
  PackageCheck,
  MapPin,
  Sprout,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

const adminMainItems = [
  { href: '/dashboard',      label: 'Home',    icon: LayoutDashboard },
  { href: '/customers',      label: 'Customers', icon: Users },
  { href: '/delivery-notes', label: 'Notes',   icon: FileText },
  { href: '/orders',         label: 'Orders',  icon: ShoppingCart },
]

const salesMainItems = [
  { href: '/dashboard',       label: 'Home',      icon: LayoutDashboard },
  { href: '/delivery-notes',  label: 'Notes',     icon: FileText },
  { href: '/agenda',          label: 'Agenda',    icon: CalendarDays },
  { href: '/handover',        label: 'Handover',  icon: PackageCheck },
]

// `permission: null` = visible to anyone signed in; `adminOnly` = owner only.
const adminMoreItems = [
  { href: '/leads',               label: 'Leads',       icon: Sprout,        permission: 'leads.view'        },
  { href: '/agenda',              label: 'Agenda',      icon: CalendarDays,  permission: null                },
  { href: '/quotations',          label: 'Quotations',  icon: ReceiptText,   permission: 'quotations.view'   },
  { href: '/products',            label: 'Products',    icon: Package,       permission: 'products.view'     },
  { href: '/sales-documents',     label: 'Sales Docs',  icon: FolderOpen,    permission: 'salesdocs.view'    },
  { href: '/tasks',               label: 'Tasks',       icon: ClipboardList, permission: 'tasks.view'        },
  { href: '/reports',              label: 'Reports',     icon: BarChart2,     permission: 'reports.view'      },
  { href: '/stock',               label: 'Stock',       icon: Droplets,      permission: 'stock.view'        },
  { href: '/handover',            label: 'Handover',    icon: PackageCheck,  permission: null                },
  { href: '/store-locator',       label: 'Locator',     icon: MapPin,        permission: 'storelocator.view' },
  { href: '/portal-management',   label: 'Portal',      icon: Globe,         permission: 'portal.view'       },
  { href: '/team',                label: 'Team',        icon: UserCog,       permission: 'team.manage'       },
  { href: '/permissions',         label: 'Permissions', icon: ShieldCheck,   permission: 'permissions.manage' },
  { href: '/email-preview',       label: 'Emails',      icon: Mail,          permission: 'settings.view'      },
  { href: '/settings',            label: 'Settings',    icon: Settings,      permission: 'settings.view'     },
]

export function BottomNav() {
  const pathname = usePathname()
  const { isAdmin, can } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function closeMore() {
    setMoreOpen(false)
    setConfirmSignOut(false)
  }

  // Driven by permission, not by "is this the owner" — otherwise a Manager
  // silently drops into the sales layout and loses tabs they may use.
  const mainItems = can('orders.view') ? adminMainItems : salesMainItems
  const moreItems = adminMoreItems.filter(i => !i.permission || can(i.permission))

  // Check if current path is in the "more" menu to highlight the button
  const moreActive = moreItems.some(i => pathname.startsWith(i.href))

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={closeMore}
        />
      )}

      {/* More drawer */}
      {moreOpen && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-background border-t border-x rounded-t-2xl shadow-xl pb-2">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">More</p>
            <button onClick={closeMore} className="text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-3">
            {moreItems.map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMore}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-colors',
                    active ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </div>

          {/* Sign out confirmation */}
          {confirmSignOut && (
            <div className="mx-3 mb-3 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
              <p className="text-sm font-medium text-center mb-3">Are you sure you want to sign out?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmSignOut(false)}
                  className="flex-1 py-2 rounded-lg border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-area-pb">
        <div className="flex">
          {mainItems.map((item) => {
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

          {/* More button — shown when this user actually has extra tabs */}
          {moreItems.length > 0 && (
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                moreOpen || moreActive ? 'text-red-600' : 'text-muted-foreground'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              More
            </button>
          )}
        </div>
      </nav>
    </>
  )
}
