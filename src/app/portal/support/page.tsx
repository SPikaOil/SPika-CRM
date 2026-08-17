'use client'

import { useEffect, useState } from 'react'
import { Mail, Phone, MessageCircle, ChevronDown, ChevronUp, Loader2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FAQ = [
  {
    q: 'How do I place an order?',
    a: 'Go to the "New Order" tab at the bottom of the screen. Select the products and quantities you need and tap "Submit Order Request". We will confirm your order as soon as possible.',
  },
  {
    q: 'How long does delivery take?',
    a: 'We aim to deliver within 1–3 business days after confirming your order. You will see the planned delivery date in your order details once it is confirmed.',
  },
  {
    q: 'Can I change or cancel my order?',
    a: 'You can cancel an order as long as it is still in "Waiting for approval" status. Once confirmed, please contact us directly to make changes.',
  },
  {
    q: 'Where can I find my invoices?',
    a: 'All your invoices are available in the "Invoices" tab. You can download a PDF of each invoice directly from there.',
  },
  {
    q: 'How do I pay my invoice?',
    a: 'Payment details are included on each invoice. You can pay via bank transfer to the account listed on the invoice. Please include the invoice number as reference.',
  },
  {
    q: 'What if a product is damaged or incorrect?',
    a: 'Please contact us immediately via WhatsApp or email with a photo of the issue. We will resolve it as quickly as possible.',
  },
  {
    q: 'How do I update my delivery address?',
    a: 'Contact your SPika account manager to update your delivery address. Changes will be reflected on your next order.',
  },
]

export default function PortalSupportPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [accountManager, setAccountManager] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    loadAccountManager()
  }, [profile?.customer_id])

  // Through a server route, not a query. A portal account may not read anyone
  // else's row in `users` — migration 076 closed a privilege escalation there —
  // so the route runs on the service key and returns three fields, for the
  // customer on the SESSION and no other.
  //
  // This card had never once appeared: the old code read customers.assigned_to,
  // a column that did not exist, and then a table called `profiles` that does
  // not exist either. Both errors were swallowed.
  async function loadAccountManager() {
    try {
      const res = await fetch('/api/portal/account-manager')
      const json = await res.json()
      setAccountManager(json.manager ?? null)
    } catch {
      setAccountManager(null)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Support</h1>
        <p className="text-muted-foreground text-xs">We're here to help.</p>
      </div>

      {/* Account manager */}
      {!isLoading && accountManager && (
        <Card className="py-0">
          <CardHeader className="pt-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Your Account Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <span className="text-red-600 font-bold text-sm">
                  {accountManager.name?.charAt(0)?.toUpperCase() ?? 'S'}
                </span>
              </div>
              <div>
                <p className="font-semibold">{accountManager.name}</p>
                <p className="text-xs text-muted-foreground">SPika Oil</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {accountManager.email && (
                <a
                  href={`mailto:${accountManager.email}`}
                  className="flex items-center gap-2 text-sm text-red-600 hover:underline"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  {accountManager.email}
                </a>
              )}
              {accountManager.phone && (
                <a
                  href={`https://wa.me/${accountManager.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-green-600 hover:underline"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  WhatsApp {accountManager.phone}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* General contact */}
      <Card className="py-0">
        <CardHeader className="pt-3 pb-2">
          <CardTitle className="text-sm">General Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-3">
          <a
            href="https://wa.me/59996896969"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 hover:bg-green-100 transition-colors"
          >
            <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400 text-sm">WhatsApp</p>
              <p className="text-[11px] text-green-600/80">+5999 689-6969 · Fastest response</p>
            </div>
          </a>
          <a
            href="mailto:hello@spikaoil.nl"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border hover:bg-accent transition-colors"
          >
            <Mail className="h-4 w-4 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-sm">Email</p>
              <p className="text-[11px] text-muted-foreground">hello@spikaoil.nl</p>
            </div>
          </a>
          <a
            href="tel:+59996896969"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border hover:bg-accent transition-colors"
          >
            <Phone className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <p className="font-medium text-sm">Phone</p>
              <p className="text-[11px] text-muted-foreground">+5999 689-6969</p>
            </div>
          </a>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="py-0">
        <CardHeader className="pt-3 pb-1">
          <CardTitle className="text-sm">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="pb-2 divide-y">
          {FAQ.map((item, i) => (
            <div key={i}>
              <button
                className="w-full flex items-center justify-between gap-2 py-2.5 text-left"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <p className="text-sm font-medium">{item.q}</p>
                {openFaq === i
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
              {openFaq === i && (
                <p className="text-sm text-muted-foreground pb-2.5">{item.a}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
