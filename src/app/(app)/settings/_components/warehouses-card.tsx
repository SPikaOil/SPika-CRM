'use client'

import { useState } from 'react'
import { Warehouse, Plus, Pencil, Trash2, X, Check, Users, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import {
  useTransportLocations, useCreateTransportLocation,
  useUpdateTransportLocation, useDeleteTransportLocation,
  useWarehouseMemberships, useSetWarehouseMember,
  useWarehouseDeliveryAddresses, useSaveWarehouseDeliveryAddress, useDeleteWarehouseDeliveryAddress,
} from '@/hooks/use-transports'
import { useUsers } from '@/hooks/use-users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TransportLocation, WarehouseDeliveryAddress } from '@/types'

const EMPTY = { name: '', code: '', street: '', zip: '', city: '', country: '', user_id: '', min_bottles: '' }

const EMPTY_DROP = {
  // Two names on purpose, and only `name` is ever printed — see migration 096.
  label: '', name: '', street: '', zip: '', city: '', country: '', receiver_contact: '',
}

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
 *
 * And two different ADDRESS facts, added 2026-08-19 (migration 095):
 *   the warehouse  — one physical address, where the stock lives
 *   delivery       — the doors it actually receives at, several per warehouse
 *
 * Her reason: DPD and the others drop part of a load somewhere else and the
 * warehouse person collects it there. Only the delivery address is printed on a
 * packing list. The name you give it here is for picking it out of a list in the
 * app and goes on no document — "enkel voor in de app, niet iets wat op pakbon
 * komt".
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

  // Delivery addresses: the row being typed. The LIST is always shown — see
  // dropList below for why it is not behind a toggle.
  const [dropForm, setDropForm] = useState(EMPTY_DROP)
  const [dropEditingId, setDropEditingId] = useState<string | null>(null)
  const [addingDropFor, setAddingDropFor] = useState<string | null>(null)

  const { data: dropOffs } = useWarehouseDeliveryAddresses()
  const saveDrop = useSaveWarehouseDeliveryAddress()
  const deleteDrop = useDeleteWarehouseDeliveryAddress()

  const dropsOf = (locationId: string) =>
    (dropOffs ?? []).filter(a => a.location_id === locationId)

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
      name: l.name ?? '', code: (l as { code?: string | null }).code ?? '', street: l.street ?? '', zip: l.zip ?? '',
      city: l.city ?? '', country: l.country ?? '',
      min_bottles: l.min_bottles === null || l.min_bottles === undefined ? '' : String(l.min_bottles),
      user_id: (l as { user_id?: string | null }).user_id ?? '',
    })
  }

  function save() {
    if (!form.name.trim()) { toast.error('Give it a name'); return }
    const values = {
      name: form.name.trim(),
      // First three letters unless somebody types their own — her rule of
      // 2026-08-21. Editable for the day two warehouses share three letters.
      code: (form.code.trim() || form.name.trim().slice(0, 3)).toUpperCase(),
      street: form.street.trim(), zip: form.zip.trim(),
      city: form.city.trim(), country: form.country.trim(),
      user_id: form.user_id || null,
      // Empty means no floor at all, which is not the same as a floor of nought.
      min_bottles: form.min_bottles.trim() === '' ? null : Number(form.min_bottles),
    }
    if (editingId) {
      updateLocation.mutate({ id: editingId, values }, { onSuccess: () => setEditingId(null) })
    } else {
      createLocation.mutate(values, { onSuccess: () => { setAdding(false); setForm(EMPTY) } })
    }
  }

  const editor = (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Name</Label>
          <Input className="h-8 text-sm" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Rotterdam warehouse" />
        </div>
        {/* The short name that goes in a batch number: SPGE22-20260722-NBC.
            Her numbering of 2026-08-20. Left empty it uses the full name. */}
        <div className="space-y-1">
          <Label className="text-xs">Short code</Label>
          <Input className="h-8 text-sm font-mono uppercase" value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder={form.name.trim().slice(0, 3).toUpperCase() || "NBC"} />
        </div>
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
        {/* The floor for this place (106). Below it, whoever works here is told
            on their dashboard that Curacao has to send something. Left empty
            there is no warning at all — a threshold the app guessed would be a
            threshold nobody acts on. */}
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Warn below … bottles</Label>
          <Input type="number" min="0" className="h-8 text-sm" placeholder="leave empty for no warning"
            value={form.min_bottles}
            onChange={e => setForm(f => ({ ...f, min_bottles: e.target.value }))} />
        </div>
      </div>

      {/* One name, and only a warehouse member — the database refuses anyone
          else, so offering them here would only produce an error later. */}
      <div className="space-y-1">
        <Label className="text-xs">In charge — signs transports in here</Label>
        <Select value={form.user_id || 'none'}
          onValueChange={v => setForm(f => ({ ...f, user_id: !v || v === 'none' ? '' : v }))}>
          {/* Written out rather than left to the Select: Radix keeps the label
              of whichever item was mounted when the value was set, and the team
              list arrives a render later than the warehouse — so the trigger sat
              showing a raw id, 4653d9be-ef7b-..., instead of a name. Same fault
              the delivery-address picker on the transport screen had. */}
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Nobody yet">
              {(() => {
                if (!form.user_id) return 'Nobody yet'
                const u = (team ?? []).find(x => x.id === form.user_id)
                return u ? (u.name || u.email) : 'Loading…'
              })()}
            </SelectValue>
          </SelectTrigger>
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

  function startNewDrop(locationId: string) {
    setDropEditingId(null); setDropForm(EMPTY_DROP); setAddingDropFor(locationId)
  }

  function startEditDrop(a: WarehouseDeliveryAddress) {
    setAddingDropFor(null)
    setDropEditingId(a.id)
    setDropForm({
      label: a.label ?? '', name: a.name ?? '',
      street: a.street ?? '', zip: a.zip ?? '',
      city: a.city ?? '', country: a.country ?? '',
      receiver_contact: a.receiver_contact ?? '',
    })
  }

  function saveDropForm(locationId: string) {
    if (!dropForm.street.trim()) { toast.error('A delivery address needs a street'); return }
    const values = {
      location_id: locationId,
      label: dropForm.label.trim(),
      name: dropForm.name.trim(),
      street: dropForm.street.trim(),
      zip: dropForm.zip.trim(),
      city: dropForm.city.trim(),
      country: dropForm.country.trim(),
      receiver_contact: dropForm.receiver_contact.trim(),
    }
    saveDrop.mutate(
      { id: dropEditingId ?? undefined, values },
      { onSuccess: () => { setDropEditingId(null); setAddingDropFor(null); setDropForm(EMPTY_DROP) } },
    )
  }

  const dropEditor = (locationId: string) => (
    <div className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
      {/* Two names, and the labels say which is which — because getting them
          the wrong way round puts our internal wording on a customs paper. */}
      <div className="space-y-1">
        <Label className="text-xs">Display name — only in the app</Label>
        <Input className="h-8 text-sm" value={dropForm.label}
          onChange={e => setDropForm(f => ({ ...f, label: e.target.value }))}
          placeholder="e.g. Warehouse NL 1" />
        <p className="text-[11px] text-muted-foreground">
          How you recognise this address here. Never printed on anything.
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Name on the packing list</Label>
        <Input className="h-8 text-sm" value={dropForm.name}
          onChange={e => setDropForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. NBC" />
        <p className="text-[11px] text-muted-foreground">
          Who the goods are addressed to at this door. This one is printed, above the street.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Street</Label>
          <Input className="h-8 text-sm" value={dropForm.street}
            onChange={e => setDropForm(f => ({ ...f, street: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Postcode</Label>
          <Input className="h-8 text-sm" value={dropForm.zip}
            onChange={e => setDropForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">City</Label>
          <Input className="h-8 text-sm" value={dropForm.city}
            onChange={e => setDropForm(f => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Country</Label>
          <Input className="h-8 text-sm" value={dropForm.country}
            onChange={e => setDropForm(f => ({ ...f, country: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Attn. — who is expected here</Label>
        <Input className="h-8 text-sm" value={dropForm.receiver_contact}
          onChange={e => setDropForm(f => ({ ...f, receiver_contact: e.target.value }))}
          placeholder="e.g. Jopie Milzink" />
        <p className="text-[11px] text-muted-foreground">
          Used on the packing list unless a transport names someone else.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={() => saveDropForm(locationId)}
          disabled={saveDrop.isPending}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {dropEditingId ? 'Save' : 'Add address'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs"
          onClick={() => { setAddingDropFor(null); setDropEditingId(null); setDropForm(EMPTY_DROP) }}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  )

  /**
   * The doors of one warehouse.
   *
   * Only the address is printed on a packing list; the name above it is how you
   * recognise it here. That is why the name is shown small and the street is the
   * line that reads as the address.
   */
  const dropList = (locationId: string) => (
    <div className="mt-2 pt-2 border-t space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">Delivery addresses</p>
        <span className="text-[11px] text-muted-foreground">
          — where a carrier actually drops the load
        </span>
      </div>

      {dropsOf(locationId).map(a =>
        dropEditingId === a.id ? (
          <div key={a.id}>{dropEditor(locationId)}</div>
        ) : (
          <div key={a.id} className="rounded-lg border px-2.5 py-1.5 flex items-start gap-2">
            {/* What is printed, shown as it is printed; what is ours, shown
                underneath and said to be ours. */}
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {a.name && <span className="font-medium">{a.name} · </span>}
                {[a.street, [a.zip, a.city].filter(Boolean).join(' '), a.country]
                  .filter(Boolean).join(', ')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {a.label ? `${a.label} — in the app only` : 'No display name'}
                {a.receiver_contact ? ` · Attn. ${a.receiver_contact}` : ''}
                {!a.name && ' · no name on the packing list yet'}
              </p>
            </div>
            {canEditPlaces && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEditDrop(a)}
                  className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent"
                  aria-label="Edit delivery address">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Remove "${a.label || a.street}"?`)) return
                    deleteDrop.mutate(a.id)
                  }}
                  className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                  aria-label="Remove delivery address">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ),
      )}

      {addingDropFor === locationId && dropEditor(locationId)}

      {dropsOf(locationId).length === 0 && addingDropFor !== locationId && (
        <p className="text-[11px] text-muted-foreground">
          None yet — every load goes to the warehouse address above.
        </p>
      )}

      {canEditPlaces && addingDropFor !== locationId && !dropEditingId && (
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
          onClick={() => startNewDrop(locationId)}>
          <Plus className="h-3.5 w-3.5" />
          Add delivery address
        </Button>
      )}
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
              {/* Always open, never behind a counter.
                  It sat behind a small truck icon with a "0" on it and she
                  could not find it at all: "ik kan nergens zien dat het gedaan
                  is en waar het allemaal staat." A thing you have to discover
                  by clicking a number is a thing nobody uses. The people list
                  stays collapsed — that one is a long checklist and it is not
                  what this card is for. */}
              {dropList(l.id)}
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
