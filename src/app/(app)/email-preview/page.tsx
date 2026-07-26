'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Smartphone, Monitor, User, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import * as T from '@/lib/email-templates'

const APP = 'https://s-pika-crm.vercel.app'

type Audience = 'customer' | 'admin' | 'team'

interface Preview {
  key: string
  name: string
  subject: string
  audience: Audience
  when: string
  html: string
  branded: boolean
}

// Realistic sample data so the preview reads like a real message
const PREVIEWS: Preview[] = [
  {
    key: 'access_request', name: 'New access request', subject: 'New access request from Restaurant Zeezicht',
    audience: 'admin', when: 'A company submits the request form on the portal', branded: true,
    html: T.emailAccessRequestAdmin({
      companyName: 'Restaurant Zeezicht', name: 'Maria Willems', email: 'maria@zeezicht.cw',
      phone: '+5999 555 0142', country: 'Curaçao', message: 'We would like to stock SPika at both locations.', appUrl: APP,
    }),
  },
  {
    key: 'account_approved', name: 'Account approved', subject: 'Your SPika B2B account is ready!',
    audience: 'customer', when: 'You approve their request', branded: true,
    html: T.emailAccountApproved({ name: 'Maria Willems', companyName: 'Restaurant Zeezicht', appUrl: APP }),
  },
  {
    key: 'new_customer', name: 'New customer created', subject: 'New customer added',
    audience: 'admin', when: 'A customer record is created', branded: true,
    html: T.emailNewCustomer({ customerName: 'Restaurant Zeezicht', email: 'maria@zeezicht.cw', category: 'horeca' }),
  },
  {
    key: 'order_placed', name: 'Order placed', subject: 'New order placed',
    audience: 'admin', when: 'A customer places an order in the portal', branded: true,
    html: T.emailOrderPlaced({ customerName: 'Restaurant Zeezicht', total: 'XCG 652.10', items: '15× SPika Oil 100ml, 35× SPika Oil 50ml' }),
  },
  {
    key: 'order_received', name: 'Order received (customer)', subject: 'We received your order',
    audience: 'customer', when: 'Immediately when they place an order — their receipt', branded: true,
    html: T.emailOrderReceived({ customerName: 'Restaurant Zeezicht', total: 'XCG 652.10', items: '15× SPika Oil 100ml, 35× SPika Oil 50ml' }),
  },
  {
    key: 'order_confirmed', name: 'Order confirmed', subject: 'Your order #729132 is confirmed!',
    audience: 'customer', when: 'You approve the order — this one carries the delivery date', branded: true,
    html: T.emailOrderConfirmed({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', plannedDate: '29 Jul 2026' }),
  },
  {
    key: 'out_for_delivery', name: 'Out for delivery', subject: 'New delivery assigned to you',
    audience: 'team', when: 'You assign the order to someone', branded: true,
    html: T.emailOutForDelivery({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', workerName: 'Djamy' }),
  },
  {
    key: 'delivered_customer', name: 'Delivered (customer)', subject: 'Your order #729132 has been delivered',
    audience: 'customer', when: 'The delivery is completed', branded: true,
    html: T.emailOrderDelivered({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', isAdmin: false }),
  },
  {
    key: 'delivered_admin', name: 'Delivered (you)', subject: 'Order #729132 delivered',
    audience: 'admin', when: 'The delivery is completed', branded: true,
    html: T.emailOrderDelivered({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', isAdmin: true }),
  },
  {
    key: 'invoice_ready', name: 'Invoice ready', subject: 'Invoice for order #729132',
    audience: 'customer', when: 'You mark the order invoice-ready', branded: true,
    html: T.emailInvoiceReady({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', total: 'XCG 652.10' }),
  },
  {
    key: 'quote_sent', name: 'Quotation sent', subject: 'Quotation Q-2026-014',
    audience: 'customer', when: 'You send a quotation', branded: true,
    html: T.emailQuoteSent({ quoteNumber: 'Q-2026-014', customerName: 'Restaurant Zeezicht', validUntil: '15 Aug 2026', total: 'XCG 1,240.00', items: '20× SPika Oil 100ml, 40× SPika Oil 50ml' }),
  },
  {
    key: 'order_modified', name: 'Order modified (you)', subject: 'Order #729132 was modified',
    audience: 'admin', when: 'A customer edits their order in the portal', branded: true,
    html: T.emailOrderModified({ orderNumber: '729132', customerName: 'Restaurant Zeezicht', items: '12× SPika Oil 100ml', total: 'XCG 480.00' }),
  },
  {
    key: 'order_modified_confirm', name: 'Order modified (customer)', subject: 'Your changes to #729132 are saved',
    audience: 'customer', when: 'After the customer edits their order', branded: true,
    html: T.emailOrderModifiedConfirmation({ orderNumber: '729132', customerName: 'Restaurant Zeezicht' }),
  },
  {
    key: 'ob_signed', name: 'OB form signed', subject: 'OB form signed',
    audience: 'admin', when: 'A customer signs the OB form', branded: true,
    html: T.emailOBFormSigned({ customerName: 'Restaurant Zeezicht', signerName: 'Maria Willems' }),
  },
  {
    key: 'handover', name: 'Handover receipt', subject: 'Handover receipt',
    audience: 'team', when: 'A team member signs for bottles', branded: true,
    html: T.emailHandoverReceipt({
      memberName: 'Djamy', batchNumber: 'B-2026-07', handoverDate: '25 Jul 2026',
      items: [{ name: 'SPika Oil 100ml', qty: 24 }, { name: 'SPika Oil 50ml', qty: 48 }],
      signedAt: '25 Jul 2026 14:30', notes: 'Picked up at the warehouse',
    }),
  },
  {
    key: 'task_assigned', name: 'Task assigned', subject: 'New task assigned to you',
    audience: 'team', when: 'You assign a task', branded: true,
    html: T.emailTaskAssigned({ workerName: 'Djamy', taskTitle: 'Bottle refill — Blue Bay', customerName: 'Blue Bay', dueDate: '28 Jul 2026' }),
  },
  {
    key: 'task_completed', name: 'Task completed', subject: 'Task completed',
    audience: 'admin', when: 'A task is ticked off', branded: true,
    html: T.emailTaskCompleted({ taskTitle: 'Bottle refill — Blue Bay', completedBy: 'Djamy', customerName: 'Blue Bay' }),
  },
]

const AUDIENCE = {
  customer: { label: 'Customer', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Building2 },
  admin: { label: 'You', cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: User },
  team: { label: 'Team', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', icon: User },
} as const

export default function EmailPreviewPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [active, setActive] = useState('order_confirmed')
  const [wide, setWide] = useState(true)
  const [filter, setFilter] = useState<'all' | Audience>('all')
  const [status, setStatus] = useState<{ configured: boolean; from?: string; adminEmail?: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  // Is sending actually configured? Without this the app fails silently.
  useEffect(() => {
    fetch('/api/notify').then(r => r.json()).then(setStatus).catch(() => {})
  }, [])

  if (authLoading || !isAdmin) return null

  const list = PREVIEWS.filter(p => filter === 'all' || p.audience === filter)
  const current = PREVIEWS.find(p => p.key === active) ?? PREVIEWS[0]

  return (
    <div className="p-3 lg:p-4 max-w-7xl mx-auto w-full space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-red-600" /> Email previews
          </h1>
          <p className="text-muted-foreground text-sm">
            Every automatic message the app sends, with sample data
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={wide ? 'default' : 'outline'} className={wide ? 'bg-red-600 hover:bg-red-700 gap-1.5' : 'gap-1.5'} onClick={() => setWide(true)}>
            <Monitor className="h-4 w-4" /> Desktop
          </Button>
          <Button size="sm" variant={!wide ? 'default' : 'outline'} className={!wide ? 'bg-red-600 hover:bg-red-700 gap-1.5' : 'gap-1.5'} onClick={() => setWide(false)}>
            <Smartphone className="h-4 w-4" /> Phone
          </Button>
        </div>
      </div>

      {/* Sending status — the app used to skip sending in silence */}
      {status && (
        status.configured ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 px-3 py-1.5 leading-tight">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">
              Sending is active — messages go out as <span className="font-medium">{status.from}</span>.
              Yours arrive at <span className="font-medium">{status.adminEmail}</span>.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">
              <span className="font-semibold">Nothing is being sent.</span> SMTP_USER and SMTP_PASS are
              not set, so every message below is skipped — no error, no warning.
            </p>
          </div>
        )
      )}

      {/* Audience filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'customer', 'admin', 'team'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              filter === f ? 'bg-red-600 text-white border-red-600' : 'bg-background hover:bg-muted border-input'
            }`}>
            {f === 'all' ? `All (${PREVIEWS.length})` : AUDIENCE[f].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
        {/* List */}
        <div className="space-y-1 lg:max-h-[70vh] lg:overflow-y-auto">
          {list.map(p => {
            const a = AUDIENCE[p.audience]
            return (
              <button key={p.key} onClick={() => setActive(p.key)}
                className={`w-full text-left px-3 py-0.5 leading-tight rounded-lg border transition-colors ${
                  active === p.key ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'bg-card hover:bg-accent'
                }`}>
                {/* Badge and name on one line — stacked they cost a second row
                    per item, which is what made this list taller than the rest
                    of the app. */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0 rounded-full shrink-0 ${a.cls}`}>{a.label}</span>
                  {!p.branded && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-700 shrink-0" title="Does not use the branded layout">plain</span>
                  )}
                  <p className="text-sm font-medium truncate">{p.name}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview */}
        <div className="space-y-2 min-w-0">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 space-y-0.5">
            <p className="text-[11px] text-muted-foreground">Subject</p>
            <p className="text-sm font-medium">{current.subject}</p>
            <p className="text-[11px] text-muted-foreground pt-1">
              Goes to <span className="font-medium text-foreground">{AUDIENCE[current.audience].label}</span> · {current.when}
            </p>
          </div>

          {!current.branded && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This one does not use the branded template — no red header bar, no footer.
                It was written separately from the other messages.
              </p>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden bg-[#f4f4f5] flex justify-center p-2">
            <iframe
              key={current.key + String(wide)}
              title={current.name}
              srcDoc={current.html}
              className="bg-white border-0"
              style={{ width: wide ? '100%' : 390, maxWidth: '100%', height: 620 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
