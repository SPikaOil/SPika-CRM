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
  weight_g: string
  bottles_per_carton: string
  box_height_cm: string
  box_length_cm: string
  box_width_cm: string
}

function num(v: number | null) {
  return v != null ? String(v) : ''
}

export default function ProductsPage() {
  const { data: products, isLoading } = useProducts()
  const updateProduct = useUpdateProduct()
  const [editing, setEditing] = useState<EditingRow | null>(null)

  function startEdit(p: ProductRecord) {
    setEditing({
      id: p.id,
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
          weight_g: parse(editing.weight_g),
          bottles_per_carton: parse(editing.bottles_per_carton) as number | null,
          box_height_cm: parse(editing.box_height_cm),
          box_length_cm: parse(editing.box_length_cm),
          box_width_cm: parse(editing.box_width_cm),
        },
      })
      toast.success('Product updated')
      setEditing(null)
    } catch {
      toast.error('Failed to save')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage product weights and dimensions for export calculations</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Product</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">SKU</th>
              <th className="text-center px-3 py-3 font-semibold">Weight (g)</th>
              <th className="text-center px-3 py-3 font-semibold">Btls / Carton</th>
              <th className="text-center px-3 py-3 font-semibold">Height (cm)</th>
              <th className="text-center px-3 py-3 font-semibold">Length (cm)</th>
              <th className="text-center px-3 py-3 font-semibold">Width (cm)</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : products?.map(p => {
                  const isEditing = editing?.id === p.id
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.sku}</td>

                      {isEditing ? (
                        <>
                          <td className="px-2 py-2">
                            <Input className="h-8 text-center w-24 mx-auto" value={editing.weight_g}
                              onChange={e => setEditing(v => v && ({ ...v, weight_g: e.target.value }))} />
                          </td>
                          <td className="px-2 py-2">
                            <Input className="h-8 text-center w-24 mx-auto" value={editing.bottles_per_carton}
                              onChange={e => setEditing(v => v && ({ ...v, bottles_per_carton: e.target.value }))} />
                          </td>
                          <td className="px-2 py-2">
                            <Input className="h-8 text-center w-24 mx-auto" value={editing.box_height_cm}
                              onChange={e => setEditing(v => v && ({ ...v, box_height_cm: e.target.value }))} />
                          </td>
                          <td className="px-2 py-2">
                            <Input className="h-8 text-center w-24 mx-auto" value={editing.box_length_cm}
                              onChange={e => setEditing(v => v && ({ ...v, box_length_cm: e.target.value }))} />
                          </td>
                          <td className="px-2 py-2">
                            <Input className="h-8 text-center w-24 mx-auto" value={editing.box_width_cm}
                              onChange={e => setEditing(v => v && ({ ...v, box_width_cm: e.target.value }))} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                                onClick={saveEdit} disabled={updateProduct.isPending}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                                onClick={() => setEditing(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-center">{p.weight_g ?? <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="px-3 py-3 text-center">{p.bottles_per_carton ?? <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="px-3 py-3 text-center">{p.box_height_cm ?? <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="px-3 py-3 text-center">{p.box_length_cm ?? <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="px-3 py-3 text-center">{p.box_width_cm ?? <span className="text-muted-foreground/50">—</span>}</td>
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
    </div>
  )
}
