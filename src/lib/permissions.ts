// Permission catalogue. Every capability the app gates on lives here, so the
// Permissions screen can show them all and an admin decides per role who gets
// what. Roles are presets over these permissions, not the source of truth.

export const ROLES = ['admin', 'manager', 'sales', 'warehouse', 'marketing'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales',
  warehouse: 'Warehouse',
  marketing: 'Marketing',
}

export interface PermissionDef {
  key: string
  label: string
  hint?: string
}

export interface PermissionGroup {
  group: string
  items: PermissionDef[]
}

// Grouped for the settings screen. Keys are stable — never rename, only add.
export const PERMISSIONS: PermissionGroup[] = [
  {
    group: 'Money',
    items: [
      { key: 'prices.view', label: 'See prices', hint: 'Order lines, invoices, quotations and PDFs' },
      { key: 'prices.edit', label: 'Change price categories', hint: 'The price lists themselves — seeing a price is not the same as setting it' },
      { key: 'targets.view', label: 'See revenue targets', hint: 'The monthly targets on the dashboard' },
      { key: 'targets.edit', label: 'Change revenue targets' },
      { key: 'reports.view', label: 'Reports', hint: 'Revenue and sales reports' },
      { key: 'audit.view', label: 'See edit history', hint: "An order's change log" },
    ],
  },
  {
    group: 'Customers',
    items: [
      { key: 'customers.view', label: 'Customers tab' },
      { key: 'customers.edit', label: 'Create and edit customers' },
      { key: 'customers.delete', label: 'Delete customers' },
      { key: 'leads.view', label: 'Leads tab' },
      { key: 'portal.view', label: 'Customer portal management' },
    ],
  },
  {
    group: 'Orders',
    items: [
      { key: 'orders.view', label: 'Orders tab' },
      { key: 'orders.create', label: 'Create orders' },
      { key: 'orders.approve', label: 'Approve pending orders' },
      { key: 'orders.edit_items', label: 'Change order lines afterwards' },
      { key: 'orders.mark_paid', label: 'Mark as invoiced / paid' },
      { key: 'orders.delete', label: 'Delete orders' },
      { key: 'quotations.view', label: 'Quotations tab' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { key: 'deliveries.own', label: 'Own delivery notes', hint: 'Run the delivery flow for assigned notes' },
      { key: 'deliveries.all', label: 'All delivery notes', hint: "Also see other people's" },
      { key: 'products.view', label: 'Products tab' },
      { key: 'stock.view', label: 'Stock & production' },
      { key: 'warehouse.view', label: 'Warehouse tab', hint: 'Stock lying at our warehouses and sales staff abroad' },
      { key: 'warehouse.receive', label: 'Sign transports in', hint: 'Book an arriving transport in, including any differences' },
      { key: 'salesdocs.view', label: 'Sales documents' },
      { key: 'marketing.view', label: 'Marketing tab', hint: 'The material customers also see in their portal' },
      { key: 'marketing.manage', label: 'Add and remove marketing assets', hint: 'Making the material. Deciding who it is for is the separate switch below. Enforced in the database too, so a role without it sees no save button and would be refused anyway' },
      { key: 'marketing.allocate', label: 'Decide who marketing material is for', hint: 'Aim an asset at named resellers or at a campaign. Nobody holds this but the admin — tick it when a marketing person is hired. A database trigger enforces it too, because a policy cannot guard one column' },
      { key: 'pos.grant', label: 'Grant POS material requests', hint: 'Put free POS material on an order, or decline it' },
      { key: 'tasks.view', label: 'Tasks', hint: 'The whole task list, everyone’s' },
      { key: 'tasks.create', label: 'Raise a task', hint: 'Report something that needs doing. It lands unassigned — see below' },
      { key: 'work.assign', label: 'Assign work to a person', hint: 'Put a name on a task, an order or a delivery run. Nobody holds this but the admin — tick it for a manager when you want them to allocate. Enforced by a database trigger too, because a policy cannot guard a single column' },
      { key: 'storelocator.view', label: 'Store locator' },
      { key: 'storelocator.edit', label: 'Change store locations' },
      { key: 'products.edit', label: 'Change products', hint: 'Everyone signed in can SEE the products — the portal catalogue needs them' },
      { key: 'carriers.edit', label: 'Change carriers' },
      { key: 'customernames.view', label: 'See the reseller name list', hint: 'Names, city and country only — no orders, no prices, no turnover' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { key: 'team.manage', label: 'Manage team members', hint: 'Create, edit and deactivate logins' },
      { key: 'settings.view', label: 'Settings' },
      { key: 'permissions.manage', label: 'Change these permissions' },
    ],
  },
]

export const ALL_PERMISSION_KEYS = PERMISSIONS.flatMap(g => g.items.map(i => i.key))

// Admin always holds everything. Kept out of the editable matrix so nobody can
// lock the owner out of her own system.
export const ADMIN_HAS_EVERYTHING = true

// Starting point only — the live values come from the role_permissions table and
// are edited on the Permissions screen. This mirrors how the app behaves today,
// so switching to permissions changes nothing until an admin decides otherwise.
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<Role, 'admin'>, string[]> = {
  manager: [
    'prices.view', 'prices.edit', 'targets.view', 'targets.edit', 'reports.view', 'audit.view',
    'customers.view', 'customers.edit', 'customernames.view', 'leads.view',
    'orders.view', 'orders.create', 'orders.approve', 'orders.edit_items', 'quotations.view',
    'deliveries.own', 'deliveries.all',
    'products.view', 'stock.view', 'salesdocs.view', 'tasks.view',
    'storelocator.view', 'storelocator.edit', 'carriers.edit',
    'tasks.create',
    // work.assign is deliberately absent. Allocating work is the admin's for
    // now; the switch exists so a manager can be given it later without a
    // migration. Her decision, 2026-08-16.
    'marketing.view', 'pos.grant',
  ],
  sales: [
    'orders.create',
    // Seeing the orders they place. Held separately from creating them, because
    // the database policy on orders reads this key — without it this role would
    // create an order it could not then open. Confirmed 2026-08-16.
    'orders.view',
    'deliveries.own',
    // Reads the name list, never the price list or the turnover behind it.
    'customernames.view',
    // May report something that needs doing. It lands unassigned; an admin
    // reviews it and puts a name on it.
    'tasks.create',
    // Sales shows this material to customers on the road, so they need to see
    // it. Publishing it is a different act and stays with the admin until she
    // hands it out on the Permissions screen.
    'marketing.view',
    // Granting POS material IS theirs on purpose: they stand in the shop and
    // know whether that second shelf actually exists.
    'pos.grant',
  ],
  // A warehouse member touches stock and nothing else. No prices, no customers,
  // no reports — they sign goods in and hand them out again.
  warehouse: [
    'warehouse.view',
    'warehouse.receive',
    'deliveries.own',
    // Sees the order behind the goods it is handing over — never the prices on
    // it, those live on price_presets. Added 2026-08-16.
    'orders.view',
    'tasks.create',
  ],
  // Marketing does exactly one thing: keep the material for resellers current.
  // No customers, no orders, no prices — and that is not just hidden screens,
  // the database refuses those tables for this role too. Deliberately the only
  // role besides Admin that may publish an asset to every reseller at once.
  // Plus three read-only tabs she added on 2026-08-16: the products the
  // material is about, where it is sold, and WHO the resellers are — never
  // what they order or pay. Looking only; the store locator and product list
  // refuse writes from this role in the database.
  marketing: [
    'marketing.view',
    // marketing.manage and marketing.allocate are deliberately absent: she asked
    // for admin-only to start with, 2026-08-16. Tick them on this role the day
    // a marketing person is actually hired.
    'products.view',
    'storelocator.view',
    'customernames.view',
    'tasks.create',
  ],
}

/**
 * Every role that belongs in the CRM and never in the customer portal.
 *
 * Was typed out separately in the portal layout and the contact-invite route,
 * and both copies were missing 'warehouse' and 'marketing' — so a warehouse
 * account could be invited as a portal contact and have its role flipped. One
 * list, so a new role cannot be forgotten in one place and not the other.
 *
 * `staff` is legacy: it appears in policies but was never added to the database
 * enum. Kept so nothing that already carries it slips through.
 */
export const INTERNAL_ROLES: string[] = ['admin', 'manager', 'sales', 'warehouse', 'marketing', 'staff']

export type PermissionMap = Record<string, string[]>

// The one place that answers "may this role do X?".
export function can(role: string | null | undefined, permission: string, map: PermissionMap): boolean {
  if (!role) return false
  if (role === 'admin') return ADMIN_HAS_EVERYTHING
  return (map[role] ?? []).includes(permission)
}
