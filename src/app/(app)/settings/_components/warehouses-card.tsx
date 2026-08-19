'use client'

import { useState } from 'react'
import { Warehouse, Plus, Pencil, Trash2, X, Check, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import {
  useTransportLocations, useCreateTransportLocation,
  useUpdateTransportLocation, useDeleteTransportLocation,
  useWarehouseMemberships, useSetWarehouseMember,
} from '@/hooks/use-transports'
import { useUsers } from '@/hooks/use-users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TransportLocation } from '@/types'

const EMPTY = { name: '', street: '', zip: '', city: '', country: '', user_id: '' }

/** Curaçao is location_id NULL everywhere, so it needs a stand-in for a form. */
const HOME = 'curacao'

/**
 * Warehouses, and who works at each one.
 *
 * In Settings, next to Carriers, because that is where the other master data
 * lives and because deciding who reaches which stock belongs on one desk. Her
 * decision of 2026-08-16.
 *
 * The Transport screen keeps its own "+ new location". Realising mid-shipment
 * that the warehouse does not exist yet is a real moment, and being sent to
 * Settings to fix it is worse than one small duplicate control.
 *
 * Two different people-facts live here and they are not the same:
 *   in charge  — one person, signs transports in, guarded by migration 066
 *   members    — everyone who works there and sees it on their Warehouse tab
 */
export function WarehousesCard() {
  const { can, isAdmin } = useAuth()
  const canEditPlaces = isAdmin || can('warehouse.view')
  const canAssign = isAdmin || can('team.manage')

  const { data: locations } = useTransportLocations()
  const { data: team } = useUsers()
  const { data: memberships } = useWarehouseMemberships()
  const createLocation = useCreateTransportLocation()
  const updateLocation = useUpdateTransportLocation()
  const deleteLocation = useDeleteTransportLocation()
  const setMember = useSetWarehouseMember()

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [openMembers, setOpenMembers] = useState<string | null>(null)

  // Only a warehouse member may be put in charge — the database refuses anyone
  // else (migration 066), so the dropdown should not offer them either.
  const inChargeCandidates = (team ?? []).filter(u => u.role === 'warehouse' && u.is_active !== false)
  // Membership is wider: a sales member abroad keeps stock too.
  const assignable = (team ?? []).filter(u => u.is_active !== false && u.role !== 'customer')

  const membersOf = (locationId: string | null) =>
    (memberships ?? []).filter(m => m.location_id === locationId)

  function startNew() {
    setEditingId(null); setForm(EMPTY); setAdding(true)
  }

  function startEdit(l: TransportLocation) {
    setAdding(false)
    setEditingId(l.id)
    setForm({
      name: l.name ?? '', street: l.street ?? '', zip: l.zip ?? '',
      city: l.city ?? '', country: l.country ?? '',
      user_id: (l as { user_id?: string | null }).user_id ?? '',
    })
  }

  function save() {
    if (!form.name.trim()) { toast.error('Give it a name'); return }
    const values = {
      name: form.name.trim(), street: form.street.trim(), zip: form.zip.trim(),
      city: form.city.trim(), country: form.country.trim(),
      user_id: form.user_id || null,
    }
    if (editingId) {
      updateLocation.mutate({ id: editingId, values }, { onSuccess: () => setEditingId(null) })
    } else {
      createLocation.mutate(values, { onSuccess: () => { setAdding(false); setForm(EMPTY) } })
    }
  }

  const editor = (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input className="h-8 text-sm" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Rotterdam warehouse" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Street</Label>
          <Input className="h-8 text-sm" value={form.street}
            onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Postcode</Label>
          <Input className="h-8 text-sm" value={form.zip}
            onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">City</Label>
          <Input className="h-8 text-sm" value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Country</Label>
          <Input className="h-8 text-sm" value={form.country}
            onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
        </div>
      </div>

      {/* One name, and only a warehouse member — the database refuses anyone
          else, so offering them here would only produce an error later. */}
      <div className="space-y-1">
        <Label className="text-xs">In charge — signs transports in here</Label>
        <Select value={form.user_id || 'none'}
          onValueChange={v => setForm(f => ({ ...f, user_id: !v || v === 'none' ? '' : v }))}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nobody yet" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nobody yet</SelectItem>
            {inChargeCandidates.map(u => (
              <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inChargeCandidates.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            No warehouse members yet — create one on the Team page first.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={save}
          disabled={createLocation.isPending || updateLocation.isPending}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {editingId ? 'Save' : 'Add warehouse'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs"
          onClick={() => { setAdding(false); setEditingId(null) }}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  )

  const memberList = (locationId: string | null, key: string) => (
    <div className="rounded-lg border divide-y mt-1.5">
      {assignable.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2.5">No team members to assign.</p>
      ) : assignable.map(u => {
        const on = membersOf(locationId).some(m => m.user_id === u.id)
        return (
          <label key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-accent">
            <input
              type="checkbox"
              className="h-4 w-4 accent-red-600 shrink-0"
              checked={on}
              disabled={!canAssign}
              onChange={e => setMember.mutate({ userId: u.id, locationId, member: e.target.checked })}
            />
            <span className="text-sm truncate">{u.name || u.email}</span>
            <span className="text-[11px] text-muted-foreground ml-auto shrink-0 capitalize">{u.role}</span>
          </label>
        )
      })}
      <p className="text-[11px] text-muted-foreground p-2.5">
        They see this warehouse — and only this one — on their Warehouse tab.
      </p>
      {!canAssign && (
        <p className="text-[11px] text-muted-foreground px-2.5 pb-2.5">
          Only an admin can change who works where.
        </p>
      )}
      <input type="hidden" data-key={key} />
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Warehouse className="h-4 w-4" />
            Warehouses
          </CardTitle>
          <CardDescription className="text-xs">
            Where stock is stored besides Curaçao, and who works at each one.
          </CardDescription>
        </div>
        {canEditPlaces && !adding && !editingId && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" />
            New warehouse
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {adding && editor}

        {/* Curaçao is not a row anywhere — it is the absence of a location. It
            still has people working at it, so it gets a card of its own here. */}
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Curaçao</p>
              <p className="text-xs text-muted-foreground">
                Home. Not a warehouse row — everything that is not stored abroad is here.
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0"
              onClick={() => setOpenMembers(openMembers === HOME ? null : HOME)}>
              <Users className="h-3.5 w-3.5 mr-1" />
              {membersOf(null).length}
            </Button>
          </div>
          {openMembers === HOME && memberList(null, HOME)}
        </div>

        {(locations ?? []).map(l =>
          editingId === l.id ? (
            <div key={l.id}>{editor}</div>
          ) : (
            <div key={l.id} className="rounded-lg border px-3 py-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[l.street, [l.zip, l.city].filter(Boolean).join(' '), l.country]
                      .filter(Boolean).join(', ') || 'No address yet'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {(l as { user?: { name?: string } }).user?.name
                      ? `In charge: ${(l as { user?: { name?: string } }).user!.name}`
                      : 'Nobody in charge — no one can sign a transport in here'}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => setOpenMembers(openMembers === l.id ? null : l.id)}>
                    <Users className="h-3.5 w-3.5 mr-1" />
                    {membersOf(l.id).length}
                  </Button>
                  {canEditPlaces && (
                    <>
                      <button onClick={() => startEdit(l)}
                        className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent"
                        aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Remove "${l.name}"?`)) return
                          deleteLocation.mutate(l.id)
                        }}
                        className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                        aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {openMembers === l.id && memberList(l.id, l.id)}
            </div>
          ),
        )}

        <p className="text-[11px] text-muted-foreground">
          A warehouse added here appears straight away when you pick a destination on a
          transport. You can still add one from there too.
        </p>
      </CardContent>
    </Card>
  )
}
