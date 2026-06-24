'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, UserPlus, Trash2, Loader2, Crown, Mail, Building2, MapPin, Phone, FileSignature, AlertCircle, CheckCircle2, Pencil, X, Check } from 'lucide-react'
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

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState({
    company_name: '',
    contact_person: '',
    phone: '',
    whatsapp: '',
    billing_street: '',
    billing_city: '',
    billing_zip: '',
    billing_country: '',
    delivery_street: '',
    delivery_city: '',
    delivery_zip: '',
    delivery_country: '',
    vat_number: '',
    crib_number: '',
    coc_number: '',
  })

  // Invite form
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
    const cust = custRes.data as Customer
    setCustomer(cust)
    setContacts((contactsRes.data ?? []) as Contact[])
    setIsOwner(selfRes.data?.customer_role === 'owner')
    setIsLoading(false)
    if (cust) {
      const b = cust.billing_address as any ?? {}
      const d = cust.delivery_address as any ?? {}
      setProfileDraft({
        company_name: cust.company_name ?? '',
        contact_person: cust.contact_person ?? '',
        phone: cust.phone ?? '',
        whatsapp: cust.whatsapp ?? '',
        billing_street: b.street ?? '',
        billing_city: b.city ?? '',
        billing_zip: b.zip ?? '',
        billing_country: b.country ?? '',
        delivery_street: d.street ?? '',
        delivery_city: d.city ?? '',
        delivery_zip: d.zip ?? '',
        delivery_country: d.country ?? '',
        vat_number: cust.vat_number ?? '',
        crib_number: cust.crib_number ?? '',
        coc_number: cust.coc_number ?? '',
      })
    }
  }

  async function saveProfile() {
    if (!profile?.customer_id) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('customers').update({
        company_name: profileDraft.company_name.trim(),
        contact_person: profileDraft.contact_person.trim(),
        phone: profileDraft.phone.trim(),
        whatsapp: profileDraft.whatsapp.trim(),
        billing_address: {
          street: profileDraft.billing_street.trim(),
          city: profileDraft.billing_city.trim(),
          zip: profileDraft.billing_zip.trim(),
          country: profileDraft.billing_country.trim(),
        },
        delivery_address: profileDraft.delivery_street.trim() ? {
          street: profileDraft.delivery_street.trim(),
          city: profileDraft.delivery_city.trim(),
          zip: profileDraft.delivery_zip.trim(),
          country: profileDraft.delivery_country.trim(),
        } : {
          street: profileDraft.billing_street.trim(),
          city: profileDraft.billing_city.trim(),
          zip: profileDraft.billing_zip.trim(),
          country: profileDraft.billing_country.trim(),
        },
        vat_number: profileDraft.vat_number.trim(),
        crib_number: profileDraft.crib_number.trim(),
        coc_number: profileDraft.coc_number.trim(),
      }).eq('id', profile.customer_id)
      if (error) throw error
      toast.success('Profile saved!')
      setEditingProfile(false)
      loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your company information and contacts.</p>
      </div>

      {/* Incomplete profile banner */}
      {customer && isOwner && (!customer.contact_person || !customer.phone || !billingAddr?.street) && (
        <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Complete your company profile</p>
            <p className="text-xs text-orange-600/80 mt-0.5">Please fill in your contact details and address so we can process your orders correctly.</p>
          </div>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white shrink-0" onClick={() => setEditingProfile(true)}>
            Fill in
          </Button>
        </div>
      )}

      {/* Company info */}
      {customer && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Details
            </CardTitle>
            {isOwner && !editingProfile && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditingProfile(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="pb-4 text-sm">
            {editingProfile ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Company Name *</Label>
                    <Input value={profileDraft.company_name} onChange={e => setProfileDraft(p => ({ ...p, company_name: e.target.value }))} className="h-8" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Contact Person *</Label>
                    <Input value={profileDraft.contact_person} onChange={e => setProfileDraft(p => ({ ...p, contact_person: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input value={profileDraft.phone} onChange={e => setProfileDraft(p => ({ ...p, phone: e.target.value }))} className="h-8" placeholder="+5999-000-0000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">WhatsApp</Label>
                    <Input value={profileDraft.whatsapp} onChange={e => setProfileDraft(p => ({ ...p, whatsapp: e.target.value }))} className="h-8" placeholder="+5999-000-0000" />
                  </div>
                </div>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Address</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Street *</Label>
                    <Input value={profileDraft.billing_street} onChange={e => setProfileDraft(p => ({ ...p, billing_street: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">City *</Label>
                    <Input value={profileDraft.billing_city} onChange={e => setProfileDraft(p => ({ ...p, billing_city: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Zip</Label>
                    <Input value={profileDraft.billing_zip} onChange={e => setProfileDraft(p => ({ ...p, billing_zip: e.target.value }))} className="h-8" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Country *</Label>
                    <Input value={profileDraft.billing_country} onChange={e => setProfileDraft(p => ({ ...p, billing_country: e.target.value }))} className="h-8" placeholder="Curaçao" />
                  </div>
                </div>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Address <span className="normal-case font-normal">(leave blank if same as billing)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Street</Label>
                    <Input value={profileDraft.delivery_street} onChange={e => setProfileDraft(p => ({ ...p, delivery_street: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">City</Label>
                    <Input value={profileDraft.delivery_city} onChange={e => setProfileDraft(p => ({ ...p, delivery_city: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Zip</Label>
                    <Input value={profileDraft.delivery_zip} onChange={e => setProfileDraft(p => ({ ...p, delivery_zip: e.target.value }))} className="h-8" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Country</Label>
                    <Input value={profileDraft.delivery_country} onChange={e => setProfileDraft(p => ({ ...p, delivery_country: e.target.value }))} className="h-8" />
                  </div>
                </div>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tax & Registration</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CRIB # (Curaçao)</Label>
                    <Input value={profileDraft.crib_number} onChange={e => setProfileDraft(p => ({ ...p, crib_number: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VAT # (international)</Label>
                    <Input value={profileDraft.vat_number} onChange={e => setProfileDraft(p => ({ ...p, vat_number: e.target.value }))} className="h-8" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">CoC / KVK #</Label>
                    <Input value={profileDraft.coc_number} onChange={e => setProfileDraft(p => ({ ...p, coc_number: e.target.value }))} className="h-8" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 gap-1" onClick={saveProfile} disabled={savingProfile || !profileDraft.company_name || !profileDraft.phone || !profileDraft.billing_street}>
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setEditingProfile(false)} disabled={savingProfile}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
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
            )}
          </CardContent>
        </Card>
      )}

      {/* OB Form */}
      {customer?.ob_form_required && (
        <Card className={customer.ob_form_signed ? 'border-green-200' : 'border-orange-200'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              OB Form (Tax Declaration)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
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

      {/* Contacts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-muted-foreground">
                  {contact.name?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  {contact.customer_role === 'owner' && (
                    <Badge className="bg-amber-100 text-amber-700 text-xs flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Owner
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
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
