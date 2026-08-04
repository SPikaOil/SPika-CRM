'use client'

import { useState } from 'react'
import { Ship, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCarriers, useSaveCarrier, useDeleteCarrier } from '@/hooks/use-transports'
import { Carrier } from '@/types'

type Draft = { name: string; route: string; bl_template: 'don_andres' | 'generic' }

const EMPTY: Draft = { name: '', route: '', bl_template: 'generic' }

/**
 * Carriers were unmanageable until migration 054: the table had a read policy
 * and nothing else, so the only three that existed were the ones migration 002
 * inserted. Admins add, edit and remove them here; the Export tab picks from
 * this list.
 */
export function CarriersCard() {
  const { data: carriers, isLoading } = useCarriers()
  const saveCarrier = useSaveCarrier()
  const deleteCarrier = useDeleteCarrier()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState<Carrier | null>(null)

  function startAdd() {
    setDraft(EMPTY)
    setEditingId(null)
    setAdding(true)
  }

  function startEdit(c: Carrier) {
    setDraft({ name: c.name, route: c.route, bl_template: c.bl_template })
    setAdding(false)
    setEditingId(c.id)
  }

  function cancel() {
    setAdding(false)
    setEditingId(null)
    setDraft(EMPTY)
  }

  async function save() {
    if (!draft.name.trim()) return
    await saveCarrier.mutateAsync({
      id: editingId ?? undefined,
      values: {
        name: draft.name.trim(),
        route: draft.route.trim(),
        bl_template: draft.bl_template,
      },
    })
    cancel()
  }

  const form = (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-xs">Name *</Label>
        <Input
          autoFocus
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Don Andres N.V."
          className="h-8"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Route</Label>
        <Input
          value={draft.route}
          onChange={e => setDraft(d => ({ ...d, route: e.target.value }))}
          placeholder="e.g. Curaçao → Bonaire"
          className="h-8"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">B/L template</Label>
        <Select
          value={draft.bl_template}
          onValueChange={(v) => v && setDraft(d => ({ ...d, bl_template: v as Draft['bl_template'] }))}
        >
          <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="generic">Generic</SelectItem>
            <SelectItem value="don_andres">Don Andres</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5" onClick={save} disabled={!draft.name.trim()}>
          <Check className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={cancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Ship className="h-4 w-4" />
          Carriers
        </CardTitle>
        <CardDescription>
          The shipping companies you can pick when putting orders on a transport
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (carriers ?? []).length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No carriers yet</p>
        ) : (
          <div className="space-y-1.5">
            {(carriers ?? []).map(c => (
              editingId === c.id ? (
                <div key={c.id}>{form}</div>
              ) : (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-0.5 leading-tight rounded-xl border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.route || 'No route'}
                      {c.bl_template === 'don_andres' && ' · Don Andres B/L'}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(c)}
                    className="text-red-500 hover:text-red-600 p-1 shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            ))}
          </div>
        )}

        {adding && form}

        {!adding && !editingId && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add carrier
          </Button>
        )}

        {/* Removing a carrier leaves existing transports pointing at nothing,
            so it is worth one deliberate confirmation. */}
        {confirmDelete && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 space-y-2">
            <p className="text-sm">
              Remove <strong>{confirmDelete.name}</strong>? Transports that already use this carrier
              will show no carrier any more.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  await deleteCarrier.mutateAsync(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                Remove
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
