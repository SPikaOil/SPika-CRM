'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'


/**
 * Two-step verification for your own account.
 *
 * Why it exists: on 2026-08-15 Danique's password turned up on a public breach
 * list. Eight accounts, two of them admin, and not one had a second step — so a
 * leaked password was the whole lock. This adds the second one.
 *
 * Enrolling is deliberately a three-step dance and Supabase enforces it:
 * enroll gives you a QR, challenge opens a window, verify closes it with a code
 * from the phone. A factor that is created but never verified stays unverified
 * and does not count — which is why the code below always cleans those up
 * before starting a new attempt, or a half-finished try blocks the next one.
 */
export function TwoFactor() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [enrolled, setEnrolled] = useState(false)
  const [busy, setBusy] = useState(false)

  // Enrolment in progress
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  async function load() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    setLoading(false)
    if (error) return
    setEnrolled((data?.totp ?? []).some(f => f.status === 'verified'))
  }

  useEffect(() => { load() }, [])

  async function startEnrol() {
    setBusy(true)
    try {
      // Clear out any half-finished attempt, otherwise Supabase refuses the
      // next enroll with "factor already exists".
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      // The authenticator app already labels the entry with the account's
      // e-mail — Supabase puts it in the TOTP label — so the name only has to
      // say WHICH app this code belongs to.
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'SPika CRM',
      })
      if (error) throw error
      setFactorId(data.id)
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start setup')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnrol() {
    if (!factorId || code.trim().length < 6) return
    setBusy(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      })
      if (error) throw error
      toast.success('Two-step verification is on')
      setQr(null); setSecret(null); setFactorId(null); setCode('')
      setEnrolled(true)
    } catch {
      // Deliberately vague: a wrong code and an expired code are the same
      // problem for the person typing it — try the current one.
      toast.error('That code did not work. Use the code showing right now.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAll() {
    setBusy(true)
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      for (const f of data?.all ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id })
      setEnrolled(false)
      toast.success('Two-step verification is off')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not turn it off')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2">
        {enrolled
          ? <ShieldCheck className="h-4 w-4 text-green-600" />
          : <ShieldAlert className="h-4 w-4 text-amber-600" />}
        Two-step verification for this account
      </p>

      <div className="space-y-3">
        {enrolled ? (
          <>
            <p className="text-sm text-muted-foreground leading-snug">
              On. Signing in asks for a code from your phone as well as your password.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600" disabled={busy} onClick={removeAll}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Turn off
            </Button>
          </>
        ) : qr ? (
          <>
            <p className="text-sm leading-snug">
              Scan this with Google Authenticator, Microsoft Authenticator or 1Password,
              then type the six-digit code it shows.
            </p>
            {/* Supabase returns the QR as an SVG data URI */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code" className="h-44 w-44 border rounded-lg bg-white" />
            <p className="text-[11px] text-muted-foreground break-all">
              Can&apos;t scan? Enter this key by hand: <span className="font-mono">{secret}</span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Six-digit code</Label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="h-9 w-32 tracking-widest text-center"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={busy || code.length < 6} onClick={confirmEnrol}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Turn on
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setQr(null); setSecret(null); setFactorId(null); setCode('') }}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-snug">
              Off. Right now your password is the only thing between someone and this
              CRM — every customer, every invoice, every price.
            </p>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5" disabled={busy} onClick={startEnrol}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Set up
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
