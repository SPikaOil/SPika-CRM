'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, KeyRound, Edit2, UserX, Check, X, Loader2, ShieldCheck, Truck, UserCircle2, Lock
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { User } from '@/types'

const roleConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  admin:  { label: 'Admin',  color: 'bg-red-100 text-red-700',   icon: ShieldCheck },
  sales:  { label: 'Sales',  color: 'bg-blue-100 text-blue-700', icon: UserCircle2 },
}

export default function TeamPage() {
  const { isAdmin, profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // New user dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('sales')
  const [newPhone, setNewPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)

  // Reset password dialog
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [newPw, setNewPw] = useState('')
  const [resetting, setResetting] = useState(false)

  // Edit dialog
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)

  // Deactivate confirm
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Own password change
  const [showOwnPw, setShowOwnPw] = useState(false)
  const [ownCurrentPw, setOwnCurrentPw] = useState('')
  const [ownNewPw, setOwnNewPw] = useState('')
  const [ownConfirmPw, setOwnConfirmPw] = useState('')
  const [changingOwnPw, setChangingOwnPw] = useState(false)

  async function handleChangeOwnPassword() {
    if (ownNewPw.length < 6) return toast.error('New password must be at least 6 characters')
    if (ownNewPw !== ownConfirmPw) return toast.error('Passwords do not match')
    setChangingOwnPw(true)
    try {
      // Re-verify current password first
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: ownCurrentPw,
      })
      if (authErr) { toast.error('Current password is incorrect'); return }
      const { error } = await supabase.auth.updateUser({ password: ownNewPw })
      if (error) throw error
      toast.success('Password changed successfully')
      setShowOwnPw(false)
      setOwnCurrentPw(''); setOwnNewPw(''); setOwnConfirmPw('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setChangingOwnPw(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return }
    loadUsers()
  }, [isAdmin])

  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setIsLoading(false)
  }

  async function handleCreate() {
    if (!newName || !newEmail || !newPassword) return toast.error('Name, email and password are required')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole, phone: newPhone, password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${newName} added successfully!`)
      setUsers(u => [...u, data])
      setShowCreate(false)
      setNewName(''); setNewEmail(''); setNewPhone(''); setNewPassword(''); setNewRole('sales')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleResetPassword() {
    if (!newPw || newPw.length < 6) return toast.error('Password must be at least 6 characters')
    if (!resetUser) return
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/users/${resetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Password updated for ${resetUser.name}`)
      setResetUser(null); setNewPw('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setResetting(false)
    }
  }

  async function handleEdit() {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, role: editRole, phone: editPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('User updated')
      setUsers(u => u.map(x => x.id === editUser.id ? data : x))
      setEditUser(null)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivateUser) return
    setDeactivating(true)
    try {
      const res = await fetch(`/api/admin/users/${deactivateUser.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${deactivateUser.name} has been deactivated`)
      setUsers(u => u.filter(x => x.id !== deactivateUser.id))
      setDeactivateUser(null)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeactivating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold">Team</h1>
          <Badge variant="secondary">{users.length} members</Badge>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      {/* My Account */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-red-600" /> My Account
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">{profile?.name}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setShowOwnPw(true)}>
            <KeyRound className="h-3.5 w-3.5" /> Change Password
          </Button>
        </CardContent>
      </Card>

      {/* User list */}
      <div className="space-y-3">
        {users.map(user => {
          const rc = roleConfig[user.role] ?? roleConfig.sales
          const Icon = rc.icon
          return (
            <Card key={user.id}>
              <CardContent className="py-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${rc.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{user.name}</p>
                    <Badge className={`text-xs ${rc.color}`}>{rc.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" title="Edit"
                    onClick={() => { setEditUser(user); setEditName(user.name); setEditRole(user.role); setEditPhone(user.phone ?? '') }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" title="Reset password"
                    onClick={() => { setResetUser(user); setNewPw('') }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" title="Deactivate" className="text-red-500 hover:text-red-700"
                    onClick={() => setDeactivateUser(user)}
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Create user dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full name <span className="text-red-500">*</span></Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Role <span className="text-red-500">*</span></Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v ?? 'worker')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+599 9 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password <span className="text-red-500">*</span></Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" />
              <p className="text-xs text-muted-foreground">The worker can change this after logging in.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset password dialog ── */}
      <Dialog open={!!resetUser} onOpenChange={() => { setResetUser(null); setNewPw('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password — {resetUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New password <span className="text-red-500">*</span></Label>
            <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleResetPassword} disabled={resetting}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="h-4 w-4 mr-1" />Set Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit user dialog ── */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit — {editUser?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v ?? editRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Save</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change own password dialog ── */}
      <Dialog open={showOwnPw} onOpenChange={v => { setShowOwnPw(v); if (!v) { setOwnCurrentPw(''); setOwnNewPw(''); setOwnConfirmPw('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change My Password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current password <span className="text-red-500">*</span></Label>
              <Input type="password" value={ownCurrentPw} onChange={e => setOwnCurrentPw(e.target.value)} placeholder="Your current password" />
            </div>
            <div className="space-y-1.5">
              <Label>New password <span className="text-red-500">*</span></Label>
              <Input type="password" value={ownNewPw} onChange={e => setOwnNewPw(e.target.value)} placeholder="Min. 6 characters" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password <span className="text-red-500">*</span></Label>
              <Input type="password" value={ownConfirmPw} onChange={e => setOwnConfirmPw(e.target.value)} placeholder="Repeat new password" />
              {ownConfirmPw && ownNewPw !== ownConfirmPw && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOwnPw(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleChangeOwnPassword}
              disabled={changingOwnPw || !ownCurrentPw || !ownNewPw || ownNewPw !== ownConfirmPw}>
              {changingOwnPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Update Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate confirm dialog ── */}
      <Dialog open={!!deactivateUser} onOpenChange={() => setDeactivateUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate {deactivateUser?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will no longer be able to log in. Their data and order history stays intact.
            You can reactivate them from Supabase if needed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" />Deactivate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
