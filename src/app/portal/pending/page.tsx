'use client'

import { BrandLockup } from '@/components/brand-mark'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle, ArrowRight, MessageCircle, Mail, LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function PendingPage() {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/portal')
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding */}
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-2">
            <BrandLockup height={30} word="SPika" />
          </div>
        </div>

        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Clock className="h-8 w-8 text-orange-500" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold">Your account is pending review</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We're reviewing your application and will get back to you within 1–2 business days.
              </p>
            </div>

            {/* Collapsible "What happens next?" */}
            <div className="w-full border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                What happens next?
                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  {[
                    'We review your application',
                    "You'll receive an email when approved",
                    'Log in and start ordering',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-red-600">{i + 1}</span>
                      </div>
                      <p className="text-sm text-muted-foreground text-left">{step}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact */}
            <div className="w-full space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">Questions? Reach out to us:</p>
              <div className="flex flex-col gap-2">
                <a
                  href="https://wa.me/59996896969"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-foreground border rounded-lg px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <MessageCircle className="h-4 w-4 text-green-600" />
                  WhatsApp +5999 689-6969
                </a>
                <a
                  href="mailto:hello@spikaoil.nl"
                  className="flex items-center justify-center gap-2 text-sm text-foreground border rounded-lg px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <Mail className="h-4 w-4 text-red-600" />
                  hello@spikaoil.nl
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <button
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
