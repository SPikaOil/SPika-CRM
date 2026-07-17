'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, UserPlus, Trash2, Loader2, Crown, Mail, Building2, MapPin, Phone, FileSignature, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Customer } from '@/types'

interface Contact {
  id: string
  name: string
  email: string
  customer_role: string
  created_at: string
}

export default function PortalAccountPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)

  // Invite form (team access is the ONLY thing a customer can manage here —
  // company details are read-only and only editable by SPika admins in the CRM)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    loadData()
  }, [profile?.customer_id])

  async function loadData() {
    if (!profile?.customer_id) return
    const [custRes, contactsRes, selfRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', profile.customer_id).single(),
      supabase.from('users').select('id, name, email, customer_role, created_at').eq('customer_id', profile.customer_id).order('created_at'),
      supabase.from('users').select('customer_role').eq('id', profile.id).single(),
    ])
    setCustomer(custRes.data as Customer)
    setContacts((contactsRes.data ?? []) as Contact[])
    setIsOwner(selfRes.data?.customer_role === 'owner')
    setIsLoading(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !inviteName) return
    setInviting(true)
    try {
      const res = await fetch('/api/portal/invite-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.existing
        ? `${inviteName} now has access to your account`
        : `Invite sent to ${inviteEmail}`
      )
      setInviteEmail('')
      setInviteName('')
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(contact: Contact) {
    if (contact.customer_role === 'owner') {
      toast.error('Cannot remove the account owner')
      return
    }
    setRemoving(contact.id)
    try {
      const { error } = await supabase.from('users').update({ customer_id: null, customer_role: 'owner' }).eq('id', contact.id)
      if (error) throw error
      toast.success(`${contact.name} removed from your account`)
      loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove contact')
    } finally {
      setRemoving(null)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  const billingAddr = customer?.billing_address as any
  const deliveryAddr = customer?.delivery_address as any

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Account</h1>
        <p className="text-muted-foreground text-xs">Your company details, kept up to date by SPika Oil.</p>
      </div>

      {/* Company info — READ ONLY. Only SPika admins can change this in the CRM. */}
      {customer && (
        <Card className="py-0">
          <CardHeader className="pt-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-sm">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company</span>
                <span className="font-medium">{customer.company_name}</span>
              </div>
              {customer.contact_person && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact</span>
                  <span className="font-medium">{customer.contact_person}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</span>
                  <span className="font-medium truncate">{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
                  <span className="font-medium">{customer.phone}</span>
                </div>
              )}
              {billingAddr?.street && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Billing</span>
                  <span className="font-medium text-right">{billingAddr.street}, {billingAddr.city}</span>
                </div>
              )}
              {deliveryAddr?.street && deliveryAddr.street !== billingAddr?.street && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Delivery</span>
                  <span className="font-medium text-right">{deliveryAddr.street}, {deliveryAddr.city}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium capitalize">{customer.customer_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment terms</span>
                <span className="font-medium">{(customer as any).payment_term_days ?? 7} days</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">
              Something not right? Contact SPika Oil and we'll update it for you.
            </p>
          </CardContent>
        </Card>
      )}

      {/* OB Form — a declaration the customer signs themselves (not editing company data) */}
      {customer?.ob_form_required && (
        <Card className={`py-0 ${customer.ob_form_signed ? 'border-green-200' : 'border-orange-200'}`}>
          <CardHeader className="pt-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              OB Form (Tax Declaration)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {customer.ob_form_signed ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Signed</p>
                  {customer.ob_form_signed_at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(customer.ob_form_signed_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    As a Curaçao-based business, an OB tax declaration form is required. Please sign it to complete your account setup.
                  </p>
                </div>
                <Link href="/portal/ob-sign">
                  <Button className="w-full bg-red-600 hover:bg-red-700 gap-2">
                    <FileSignature className="h-4 w-4" />
                    Sign OB Form
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Members — customers may invite/remove their own portal users.
          These sync to the central users table, so SPika admins see them in the CRM. */}
      <Card className="py-0">
        <CardHeader className="pt-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 space-y-2.5">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">
                  {contact.name?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  {contact.customer_role === 'owner' && (
                    <Badge className="bg-amber-100 text-amber-700 text-[11px] px-1.5 py-0 flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Owner
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{contact.email}</p>
              </div>
              {isOwner && contact.id !== profile?.id && contact.customer_role !== 'owner' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600 shrink-0"
                  disabled={removing === contact.id}
                  onClick={() => handleRemove(contact)}
                >
                  {removing === contact.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </Button>
              )}
            </div>
          ))}

          {/* Invite form — owners only */}
          {isOwner && (
            <>
              <Separator />
              <form onSubmit={handleInvite} className="space-y-3 pt-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite a team member
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email address</Label>
                  <Input
                    type="email"
                    placeholder="jane@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 gap-2"
                  disabled={inviting || !inviteEmail || !inviteName}
                >
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {inviting ? 'Sending invite…' : 'Send Invite'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  They'll receive an email to set up their password and access your account.
                </p>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
