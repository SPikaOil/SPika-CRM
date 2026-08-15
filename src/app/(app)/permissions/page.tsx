'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2, Check, RotateCcw } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  PERMISSIONS, ROLE_LABELS, DEFAULT_ROLE_PERMISSIONS,
  type PermissionMap,
} from '@/lib/permissions'

// Roles you can actually edit. Admin is absent on purpose: it always holds
// everything, so nobody can tick the owner out of her own system.
const EDITABLE_ROLES = ['manager', 'sales', 'warehouse'] as const

// The column widths follow the number of roles instead of being hard-coded at
// three. Adding Warehouse pushed a fourth column onto its own line, which put
// every checkbox under the wrong header.
const GRID = {
  gridTemplateColumns: `1fr repeat(${EDITABLE_ROLES.length + 1}, minmax(40px, 56px))`,
}

export default function PermissionsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [matrix, setMatrix] = useState<PermissionMap>({})
  const [original, setOriginal] = useState<PermissionMap>({})

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  useEffect(() => {
    supabase.from('role_permissions').select('role, permissions').then(({ data }) => {
      const map: PermissionMap = {}
      for (const r of EDITABLE_ROLES) map[r] = []
      for (const row of (data ?? []) as any[]) map[row.role] = row.permissions ?? []
      setMatrix(map)
      setOriginal(JSON.parse(JSON.stringify(map)))
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = JSON.stringify(matrix) !== JSON.stringify(original)

  function toggle(role: string, key: string) {
    setMatrix(prev => {
      const current = prev[role] ?? []
      return {
        ...prev,
        [role]: current.includes(key) ? current.filter(k => k !== key) : [...current, key],
      }
    })
  }

  function toggleGroup(role: string, keys: string[], on: boolean) {
    setMatrix(prev => {
      const current = new Set(prev[role] ?? [])
      for (const k of keys) on ? current.add(k) : current.delete(k)
      return { ...prev, [role]: [...current] }
    })
  }

  async function save() {
    setSaving(true)
    const rows = EDITABLE_ROLES.map(role => ({
      role,
      permissions: matrix[role] ?? [],
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('role_permissions').upsert(rows)
    setSaving(false)
    if (error) { toast.error(`Could not save: ${error.message}`); return }
    setOriginal(JSON.parse(JSON.stringify(matrix)))
    toast.success('Permissions saved — users see the change after their next page load')
  }

  function resetToDefaults() {
    setMatrix({
      manager: [...DEFAULT_ROLE_PERMISSIONS.manager],
      sales: [...DEFAULT_ROLE_PERMISSIONS.sales],
      warehouse: [...DEFAULT_ROLE_PERMISSIONS.warehouse],
    })
  }

  if (authLoading || !isAdmin) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-5xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-red-600" /> Permissions
          </h1>
          <p className="text-muted-foreground text-sm">
            Decide what each role may do. Admin always has everything.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetToDefaults}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
            disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        <>
          {PERMISSIONS.map(group => {
            const keys = group.items.map(i => i.key)
            return (
              <Card key={group.group} className="py-0 gap-0">
                <CardContent className="p-0">
                  {/* Group name doubles as the "Permission" column header — as a
                      separate title bar it cost 40px plus a 16px gap per card. */}
                  <div style={GRID} className="grid gap-2 px-3 sm:px-4 py-1 border-b bg-muted/30">
                    <span className="text-sm font-semibold">{group.group}</span>
                    <span className="text-[11px] text-center text-muted-foreground self-center">Admin</span>
                    {EDITABLE_ROLES.map(r => (
                      <button key={r} type="button"
                        onClick={() => {
                          const allOn = keys.every(k => (matrix[r] ?? []).includes(k))
                          toggleGroup(r, keys, !allOn)
                        }}
                        className="text-[11px] text-center text-muted-foreground hover:text-foreground underline underline-offset-2"
                        title={`Toggle all ${group.group} for ${ROLE_LABELS[r]}`}>
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>

                  {group.items.map(item => (
                    <div key={item.key}
                      style={GRID} className="grid gap-2 items-center px-3 sm:px-4 py-0.5 leading-tight border-b last:border-0">
                      {/* Hint sits after the label instead of under it — on its
                          own line it nearly doubled the row height. It is hidden
                          on phones, where there is only room for a stub like
                          "Re…" and the label would be pushed over the boxes. */}
                      <div className="min-w-0 flex items-baseline gap-2">
                        <p className="text-sm truncate">{item.label}</p>
                        {item.hint && (
                          <p className="hidden sm:block text-[11px] text-muted-foreground truncate">{item.hint}</p>
                        )}
                      </div>
                      {/* Admin — always on, never editable */}
                      <div className="flex justify-center">
                        <input type="checkbox" checked readOnly disabled
                          className="rounded accent-gray-400 cursor-not-allowed" title="Admin always has every permission" />
                      </div>
                      {EDITABLE_ROLES.map(role => (
                        <div key={role} className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={(matrix[role] ?? []).includes(item.key)}
                            onChange={() => toggle(role, item.key)}
                            className="rounded accent-red-600 cursor-pointer h-4 w-4"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}

          {dirty && (
            <div className="sticky bottom-3 flex justify-end">
              <Button className="bg-red-600 hover:bg-red-700 gap-1.5 shadow-lg" disabled={saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
