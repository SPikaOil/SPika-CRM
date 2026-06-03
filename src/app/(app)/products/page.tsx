'use client'

import { useState } from 'react'
import { Pencil, Check, X, Package } from 'lucide-react'
import { useProducts, useUpdateProduct, ProductRecord } from '@/hooks/use-products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

type EditingRow = {
  id: string
  product_code: string
  weight_g: string
  bottles_per_carton: string
  box_height_cm: string
  box_length_cm: string
  box_width_cm: string
}

function num(v: number | null) {
  return v != null ? String(v) : ''
}

function dash(v: string | number | null) {
  return v != null && v !== '' ? v : <span className="text-muted-foreground/50">—</span>
}

export default function ProductsPage() {
  const { data: products, isLoading } = useProducts()
  const updateProduct = useUpdateProduct()
  const [editing, setEditing] = useState<EditingRow | null>(null)

  function startEdit(p: ProductRecord) {
    setEditing({
      id: p.id,
      product_code: p.product_code ?? '',
      weight_g: num(p.weight_g),
      bottles_per_carton: num(p.bottles_per_carton),
      box_height_cm: num(p.box_height_cm),
      box_length_cm: num(p.box_length_cm),
      box_width_cm: num(p.box_width_cm),
    })
  }

  async function saveEdit() {
    if (!editing) return
    const parse = (v: string) => v.trim() === '' ? null : Number(v)
    try {
      await updateProduct.mutateAsync({
        id: editing.id,
        values: {
          product_code: editing.product_code.trim() || null,
          weight_g: parse(editing.weight_g),
          bottles_per_carton: parse(editing.bottles_per_carton) as number | null,
          box_height_cm: parse(editing.box_height_cm),
          box_length_cm: parse(editing.box_length_cm),
          box_width_cm: parse(editing.box_width_cm),
        },
      })
      toast.success('Product updated')
      setEditing(null)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save')
    }
  }

  const fields: { key: keyof EditingRow; label: string; type?: string }[] = [
    { key: 'product_code', label: 'Product Code' },
    { key: 'weight_g',          label: 'Weight (g)',      type: 'number' },
    { key: 'bottles_per_carton',label: 'Btls / Carton',   type: 'number' },
    { key: 'box_height_cm',     label: 'Height (cm)',     type: 'number' },
    { key: 'box_length_cm',     label: 'Length (cm)',     type: 'number' },
    { key: 'box_width_cm',      label: 'Width (cm)',      type: 'number' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage product codes, weights and dimensions for export calculations</p>
        </div>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden md:block rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Product</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">SKU</th>
              {fields.map(f => (
                <th key={f.key} className="text-center px-3 py-3 font-semibold whitespace-nowrap">{f.label}</th>
              ))}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    ))}
                  </tr>
                ))
              : products?.map(p => {
                  const isEditing = editing?.id === p.id
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{p.sku}</td>
                      {isEditing ? (
                        <>
                          {fields.map(f => (
                            <td key={f.key} className="px-2 py-2">
                              <Input
                                className="h-8 text-center w-24 mx-auto"
                                type={f.type ?? 'text'}
                                value={editing[f.key]}
                                onChange={e => setEditing(v => v && ({ ...v, [f.key]: e.target.value }))}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={saveEdit} disabled={updateProduct.isPending}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditing(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-center font-mono text-xs">{dash(p.product_code)}</td>
                          <td className="px-3 py-3 text-center">{dash(p.weight_g)}</td>
                          <td className="px-3 py-3 text-center">{dash(p.bottles_per_carton)}</td>
                          <td className="px-3 py-3 text-center">{dash(p.box_height_cm)}</td>
                          <td className="px-3 py-3 text-center">{dash(p.box_length_cm)}</td>
                          <td className="px-3 py-3 text-center">{dash(p.box_width_cm)}</td>
                          <td className="px-3 py-3">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))
          : products?.map(p => {
              const isEditing = editing?.id === p.id
              return (
                <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                    </div>
                    {isEditing ? (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={saveEdit} disabled={updateProduct.isPending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditing(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {fields.map(f => {
                      const displayVal = p[f.key as keyof ProductRecord]
                      return (
                        <div key={f.key} className="space-y-1">
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          {isEditing ? (
                            <Input
                              className="h-8 text-sm"
                              type={f.type ?? 'text'}
                              value={editing[f.key]}
                              onChange={e => setEditing(v => v && ({ ...v, [f.key]: e.target.value }))}
                            />
                          ) : (
                            <p className="text-sm font-medium">{dash(displayVal as string | number | null)}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
      </div>
    </div>
  )
}
