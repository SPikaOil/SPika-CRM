'use client'

import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { TwoFactor } from '@/components/two-factor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The gate for someone whose admin has required two-step verification but who
 * has not set it up yet. The app layout parks them here.
 *
 * Deliberately NOT a dead end: everything needed to comply is on this page. It
 * blocks the rest of the CRM, not the person.
 */
export default function SecurityPage() {
  const { profile } = useAuth()

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto w-full space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" /> One more step
        </h1>
        <p className="text-muted-foreground text-sm">
          Two-step verification is required on this account before you can continue.
        </p>
      </div>

      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{profile?.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{profile?.email}</p>
          <TwoFactor />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground leading-snug">
        You need an authenticator app on your phone — Google Authenticator,
        Microsoft Authenticator or 1Password all work. Scan the code once, and
        from then on signing in asks for the six digits it shows.
      </p>
    </div>
  )
}
