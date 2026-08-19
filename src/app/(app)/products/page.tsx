'use client'

import { useEffect, useState } from 'react'
import { Pencil, Check, X, Package, Tag, Plus, Trash2, ChevronDown, ChevronUp, Loader2, FileSpreadsheet } from 'lucide-react'
import { downloadCsv, csvMoney } from '@/lib/csv-export'
import { useAuth } from '@/contexts/auth-context'
import { useProducts, useUpdateProduct, ProductRecord } from '@/hooks/use-products'
import { usePricePresets, useUpdatePricePreset, useCreatePricePreset, useDeletePricePreset } from '@/hooks/use-price-presets'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { PriceInput } from '@/components/ui/price-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderCurrency } from '@/types'
import { toast } from 'sonner'

// ── Products tab ───────────────────────────────────────────────────────────

type EditingRow = {
  id: string
  product_code: string
  weight_g: string
  bottles_per_carton: string
  box_height_cm: string
  box_length_cm: string
  box_width_cm: string
  real_volume_ml: string
  vvp: string
}

function num(v: number | null) { return v != null ? String(v) : '' }
function dash(v: string | number | null) {
  return v != null && v !== '' ? v : <span className="text-muted-foreground/50">—</span>
}

function ProductsTab() {
  const { isAdmin } = useAuth()
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
      real_volume_ml: num(p.real_volume_ml),
      vvp: num(p.vvp),
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
          real_volume_ml: parse(editing.real_volume_ml),
          // Only sent when an admin is editing — the field is not even rendered
          // otherwise, and the database would refuse it anyway (migration 055).
          ...(isAdmin ? { vvp: parse(editing.vvp) } : {}),
        },
      })
      toast.success('Product updated')
      setEditing(null)
    } catch (err) {
      toast.error('Failed to save')
    }
  }

  const fields: { key: keyof EditingRow; label: string; type?: string }[] = [
    { key: 'product_code',      label: 'Product Code' },
    // Cost price. Admin-only on screen AND in the database (migration 055), so
    // nobody else ever sees what a bottle costs us.
    ...(isAdmin ? [{ key: 'vvp' as keyof EditingRow, label: 'VVP (cost)', type: 'number' }] : []),
    { key: 'real_volume_ml',    label: 'Real Volume (ml)', type: 'number' },
    { key: 'weight_g',          label: 'Weight (g)',    type: 'number' },
    { key: 'bottles_per_carton',label: 'Btls / Carton', type: 'number' },
    { key: 'box_height_cm',     label: 'Height (cm)',   type: 'number' },
    { key: 'box_length_cm',     label: 'Length (cm)',   type: 'number' },
    { key: 'box_width_cm',      label: 'Width (cm)',    type: 'number' },
  ]

  return (
    <>
      {/* Desktop table */}
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
                  <tr key={i}>{Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                  ))}</tr>
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
                            <td key={f.key} className="px-1 py-2">
                              <Input className="h-8 text-center w-full px-1" type={f.type ?? 'text'}
                                value={editing[f.key]}
                                onChange={e => setEditing(v => v && ({ ...v, [f.key]: e.target.value }))} />
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
                          {/* One cell per FIELD, not six hardcoded ones. The
                              header maps over fields — eight of them for an
                              admin, who also sees VVP and real volume — so six
                              cells put every value under the wrong heading and
                              left two columns empty. */}
                          {fields.map(f => (
                            <td
                              key={f.key}
                              className={`px-2 py-3 text-center ${f.key === 'product_code' ? 'font-mono text-xs' : ''}`}
                            >
                              {dash((p as never)[f.key])}
                            </td>
                          ))}
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
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
                            <Input className="h-8 text-sm" type={f.type ?? 'text'}
                              value={editing[f.key]}
                              onChange={e => setEditing(v => v && ({ ...v, [f.key]: e.target.value }))} />
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
    </>
  )
}

// ── Categories tab ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const { data: presets, isLoading } = usePricePresets()
  const { mutateAsync: updatePreset } = useUpdatePricePreset()
  const createPreset = useCreatePricePreset()
  const deletePreset = useDeletePricePreset()

  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [localPrices, setLocalPrices] = useState<Record<string, Record<string, number>>>({})
  const [localDiscounts, setLocalDiscounts] = useState<Record<string, Record<string, number>>>({})
  const [localProducts, setLocalProducts] = useState<Record<string, string[]>>({})
  const [localCurrency, setLocalCurrency] = useState<Record<string, OrderCurrency>>({})
  const [saving, setSaving] = useState<string | null>(null)

  // New category form
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newCurrency, setNewCurrency] = useState<OrderCurrency>('XCG')

  useEffect(() => {
    if (!presets) return
    const initPrices: Record<string, Record<string, number>> = {}
    const initDiscounts: Record<string, Record<string, number>> = {}
    const initProducts: Record<string, string[]> = {}
    const initCurrency: Record<string, OrderCurrency> = {}
    for (const p of presets) {
      initPrices[p.category] = { ...p.prices }
      initDiscounts[p.category] = { ...(p.discounts ?? {}) }
      initProducts[p.category] = [...(p.products ?? [])]
      initCurrency[p.category] = p.currency ?? 'XCG'
    }
    setLocalPrices(initPrices)
    setLocalDiscounts(initDiscounts)
    setLocalProducts(initProducts)
    setLocalCurrency(initCurrency)
  }, [presets])

  function toggleProduct(category: string, sku: string, checked: boolean) {
    setLocalProducts(prev => {
      const current = prev[category] ?? []
      return {
        ...prev,
        [category]: checked ? [...current, sku] : current.filter(s => s !== sku),
      }
    })
  }

  function setPrice(category: string, sku: string, v: number) {
    setLocalPrices(prev => ({ ...prev, [category]: { ...prev[category], [sku]: v } }))
  }

  function setDiscount(category: string, sku: string, v: number) {
    setLocalDiscounts(prev => ({ ...prev, [category]: { ...prev[category], [sku]: v } }))
  }

  async function handleSave(category: string, id: string) {
    setSaving(category)
    try {
      const activeSkus = localProducts[category] ?? []
      // Only keep prices/discounts for active SKUs
      const filteredPrices = Object.fromEntries(
        Object.entries(localPrices[category] ?? {}).filter(([sku]) => activeSkus.includes(sku))
      )
      const filteredDiscounts = Object.fromEntries(
        Object.entries(localDiscounts[category] ?? {}).filter(([sku]) => activeSkus.includes(sku))
      )
      await updatePreset({
        id,
        prices: filteredPrices,
        discounts: filteredDiscounts,
        products: activeSkus,
        currency: localCurrency[category] ?? 'XCG',
      })
      toast.success('Saved')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(null)
    }
  }

  async function handleAdd() {
    const label = newLabel.trim()
    const category = newKey.trim().toLowerCase().replace(/\s+/g, '_')
    if (!label || !category) return toast.error('Fill in both a name and a key')
    if (presets?.some(p => p.category === category)) return toast.error('Category key already exists')
    try {
      await createPreset.mutateAsync({ category, label, currency: newCurrency })
      toast.success(`Category "${label}" added in ${newCurrency}`)
      setNewLabel('')
      setNewKey('')
      setNewCurrency('XCG')
      setShowAdd(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete category "${label}"? This won't affect existing customers.`)) return
    try {
      await deletePreset.mutateAsync(id)
      toast.success('Category deleted')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (isLoading) return <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Default prices &amp; discounts per customer category. Applied automatically when creating a customer.
      </p>

      <div className="space-y-2">
        {(presets ?? []).map(preset => {
          const isOpen = openCategory === preset.category
          const prices = localPrices[preset.category] ?? {}
          const discounts = localDiscounts[preset.category] ?? {}
          const activeCount = (preset.products ?? []).length
          const customCount = Object.keys(preset.prices).length + Object.keys(preset.discounts ?? {}).length

          return (
            <div key={preset.category} className="border rounded-lg overflow-hidden">
              <div className="flex items-center">
                <button
                  type="button"
                  className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left"
                  onClick={() => setOpenCategory(isOpen ? null : preset.category)}
                >
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      {preset.label}
                      {(preset.currency ?? 'XCG') !== 'XCG' && (
                        <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">{preset.currency}</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {preset.currency ?? 'XCG'} · {activeCount > 0 ? `${activeCount} products` : 'No products selected'}{customCount > 0 ? ` · ${customCount} custom prices` : ''} · key: {preset.category}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button
                  type="button"
                  className="px-3 py-3 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                  onClick={() => handleDelete(preset.id, preset.label)}
                  title="Delete category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {isOpen && (
                <div className="border-t space-y-0">
                  {/* Currency for this category. Prices below are ENTERED in it —
                      nothing is converted, so switching this does not touch the
                      numbers, only what they mean. */}
                  <div className="px-4 py-3 border-b flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Currency</p>
                      <p className="text-xs text-muted-foreground">
                        Prices below are entered in this currency and are never converted
                      </p>
                    </div>
                    <div className="flex rounded-md border overflow-hidden shrink-0">
                      {(['XCG', 'USD', 'EUR'] as OrderCurrency[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setLocalCurrency(prev => ({ ...prev, [preset.category]: c }))}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            (localCurrency[preset.category] ?? 'XCG') === c
                              ? 'bg-red-600 text-white'
                              : 'text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="divide-y">
                    {SPIKA_PRODUCTS.map(product => {
                      const active = (localProducts[preset.category] ?? []).includes(product.sku)
                      return (
                        <div key={product.sku} className="px-4 py-3">
                          <label className="flex items-center gap-3 cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={e => toggleProduct(preset.category, product.sku, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <div>
                              <p className="text-sm font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground">default XCG {product.default_price.toFixed(2)}</p>
                            </div>
                          </label>
                          {active && (
                            <div className="flex gap-3 pl-7">
                              <div className="flex-1 space-y-1">
                                <p className="text-xs text-muted-foreground">Price ({localCurrency[preset.category] ?? 'XCG'})</p>
                                <PriceInput
                                  value={prices[product.sku] ?? 0}
                                  onChange={v => setPrice(preset.category, product.sku, v)}
                                  placeholder={(localCurrency[preset.category] ?? 'XCG') === 'XCG' ? product.default_price.toFixed(2) : '0.00'}
                                  className="h-8"
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <p className="text-xs text-muted-foreground">Discount</p>
                                <PriceInput
                                  value={discounts[product.sku] ?? 0}
                                  onChange={v => setDiscount(preset.category, product.sku, v)}
                                  placeholder="0.00"
                                  className="h-8"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-3 border-t">
                    <Button
                      className="bg-red-600 hover:bg-red-700 gap-2"
                      onClick={() => handleSave(preset.category, preset.id)}
                      disabled={saving === preset.category}
                    >
                      {saving === preset.category && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save {preset.label}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new category */}
      {showAdd ? (
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">New Category</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Display name</p>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Retail (B2B)" className="h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Key (auto-slug)</p>
              <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. retail" className="h-8 font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Currency — prices for this category are entered in it</p>
            <div className="flex rounded-md border overflow-hidden w-fit">
              {(['XCG', 'USD', 'EUR'] as OrderCurrency[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewCurrency(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    newCurrency === c ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={createPreset.isPending} className="bg-red-600 hover:bg-red-700">
              {createPreset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setNewLabel(''); setNewKey('') }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const { data: allProducts } = useProducts()

  function exportProductsCsv() {
    downloadCsv(
      'products',
      ['SKU', 'Name', 'Product code', 'Default price (XCG)', 'Real volume (ml)',
       'Weight (g)', 'Bottles per carton', 'Box L (cm)', 'Box W (cm)', 'Box H (cm)'],
      (allProducts ?? []).map(p => [
        p.sku, p.name, p.product_code ?? '',
        csvMoney(p.default_price),
        p.real_volume_ml ?? '', p.weight_g ?? '', p.bottles_per_carton ?? '',
        p.box_length_cm ?? '', p.box_width_cm ?? '', p.box_height_cm ?? '',
      ])
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage products and customer category pricing</p>
        </div>
        <Button variant="outline" size="icon" title="Export CSV" className="ml-auto"
          onClick={exportProductsCsv}>
          <FileSpreadsheet className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted w-fit">
        <button
          onClick={() => setTab('products')}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tab === 'products' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Package className="h-3.5 w-3.5" /> Products
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tab === 'categories' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Tag className="h-3.5 w-3.5" /> Categories
        </button>
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  )
}
