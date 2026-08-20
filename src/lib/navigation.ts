import {
  LayoutDashboard, Users, Sprout, ReceiptText, FileText, ShoppingCart, Package,
  Megaphone, CalendarRange, Store, FolderOpen, ClipboardList, CalendarDays,
  BarChart2, Droplets, PackageCheck, Warehouse, MapPin, Ship, Globe, UserCog,
  ShieldCheck, Mail, Settings,
} from 'lucide-react'
import type { ComponentType } from 'react'

/**
 * Every screen in the CRM, once.
 *
 * There used to be two lists: one in sidebar.tsx for the desktop rail and one in
 * bottom-nav.tsx for the phone. Nothing kept them together, so adding a screen
 * meant remembering both — and Warehouse never made it into the second one. On
 * a phone, which is where a warehouse member actually works, that tab simply
 * did not exist. Nobody noticed until Danique went looking for it on 2026-08-19.
 *
 * One list now. A screen added here appears in both places or in neither, and
 * the two can no longer drift.
 *
 * `permission: null` means anyone signed in sees it. `adminOnly` means the
 * owner and nobody else — kept separate from a permission on purpose, because
 * these are not things to hand out.
 *
 * `mainOnMobile` marks the four that sit in the fixed bar at the bottom of a
 * phone rather than inside More. The desktop rail shows everything regardless.
 */
export interface NavItem {
  href: string
  /** The full label, used on the desktop rail. */
  label: string
  /** Shorter, for a phone where there are four columns and no room. */
  shortLabel?: string
  icon: ComponentType<{ className?: string }>
  permission: string | null
  adminOnly?: boolean
  /** In the fixed bottom bar on a phone: 'admin' for people who see orders,
   *  'sales' for those who do not. Everything else lives under More. */
  mainOnMobile?: 'admin' | 'sales' | 'both'
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',        shortLabel: 'Home',      icon: LayoutDashboard, permission: null,                 mainOnMobile: 'both'  },
  { href: '/customers',       label: 'Customers',                                 icon: Users,           permission: 'customers.view',     mainOnMobile: 'admin' },
  { href: '/delivery-notes',  label: 'Delivery Notes',   shortLabel: 'Notes',     icon: FileText,        permission: null,                 mainOnMobile: 'both'  },
  { href: '/orders',          label: 'Orders',                                    icon: ShoppingCart,    permission: 'orders.view',        mainOnMobile: 'admin' },
  { href: '/agenda',          label: 'Agenda',                                    icon: CalendarDays,    permission: null,                 mainOnMobile: 'sales' },
  { href: '/handover',        label: 'Handover Btls',    shortLabel: 'Handover',  icon: PackageCheck,    permission: null,                 mainOnMobile: 'sales' },

  { href: '/leads',           label: 'Leads',                                     icon: Sprout,          permission: 'leads.view'          },
  { href: '/quotations',      label: 'Quotations',                                icon: ReceiptText,     permission: 'quotations.view'     },
  { href: '/products',        label: 'Products',                                  icon: Package,         permission: 'products.view'       },
  { href: '/marketing',       label: 'Marketing',                                 icon: Megaphone,       permission: 'marketing.view'      },
  { href: '/campaigns',       label: 'Campaigns',                                 icon: CalendarRange,   permission: 'marketing.view'      },
  { href: '/resellers',       label: 'Resellers',                                 icon: Store,           permission: 'customernames.view'  },
  { href: '/sales-documents', label: 'Sales Docs',                                icon: FolderOpen,      permission: 'salesdocs.view'      },
  { href: '/tasks',           label: 'Tasks',                                     icon: ClipboardList,   permission: 'tasks.create'        },
  { href: '/reports',         label: 'Reports',                                   icon: BarChart2,       permission: 'reports.view'        },
  { href: '/stock',           label: 'Stock & Production', shortLabel: 'Stock',   icon: Droplets,        permission: 'stock.view'          },
  // In the bottom bar on a phone, not buried under More. A warehouse member
  // works on a phone — it says so at the top of this file — and the one tab
  // they open all day was two taps away. Her instruction, 2026-08-20.
  { href: '/warehouse',       label: 'Warehouse',                                 icon: Warehouse,       permission: 'warehouse.view',     mainOnMobile: 'both'  },
  { href: '/store-locator',   label: 'Store Locator',    shortLabel: 'Locator',   icon: MapPin,          permission: 'storelocator.view'   },

  { href: '/exports',           label: 'Export',                                  icon: Ship,            permission: null, adminOnly: true },
  { href: '/portal-management', label: 'Portal',                                  icon: Globe,           permission: 'portal.view'         },
  { href: '/team',              label: 'Team',                                    icon: UserCog,         permission: 'team.manage'         },
  { href: '/permissions',       label: 'Permissions',                             icon: ShieldCheck,     permission: 'permissions.manage'  },
  { href: '/email-preview',     label: 'Emails',                                  icon: Mail,            permission: 'settings.view'       },
  { href: '/settings',          label: 'Settings',                                icon: Settings,        permission: 'settings.view'       },
]

/** What this person may open, in order. */
export function visibleNav(
  can: (p: string) => boolean,
  isAdmin: boolean,
): NavItem[] {
  return NAV_ITEMS.filter(i => (!i.adminOnly || isAdmin) && (!i.permission || can(i.permission)))
}

/** The four in the fixed bar on a phone. Everything else goes under More. */
export function mobileMainNav(
  can: (p: string) => boolean,
  isAdmin: boolean,
): NavItem[] {
  const layout = can('orders.view') ? 'admin' : 'sales'
  return visibleNav(can, isAdmin)
    .filter(i => i.mainOnMobile === 'both' || i.mainOnMobile === layout)
    .slice(0, 4)
}

/** Everything that did not fit in the bar. Never a screen that has no home. */
export function mobileMoreNav(
  can: (p: string) => boolean,
  isAdmin: boolean,
): NavItem[] {
  const main = new Set(mobileMainNav(can, isAdmin).map(i => i.href))
  return visibleNav(can, isAdmin).filter(i => !main.has(i.href))
}
