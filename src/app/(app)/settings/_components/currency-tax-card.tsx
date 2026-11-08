'use client'

import { useEffect, useState } from 'react'
import { Coins, Plus, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { usePricePresets } from '@/hooks/use-price-presets'
import {
  useCurrencyTax,
  useSaveTaxSettings,
  type CurrencyTaxMap,
  type CategoryTaxMap,
} from '@/hooks/use-currency-tax'

/**
 * Tax: the NAME per currency, the PERCENTAGE per customer category.
 *
 * Danique, 2026-11-06: "de stelregel is: valuta is leidend", and then, when a
 * first version hung the rate on the currency as well: "XCG is 0, 6 en soms
 * 9... de klantcategorie bepaalt het tarief." Two questions, two homes, one
 * card — a second place to set a percentage is the bug this replaces.
 *
 * Admin only: the Settings page sends everyone else away, and app_settings
 * refuses a write without settings.view, which no other role holds.
 *
 * One line per row on a phone as well as on a desktop. Stacking labelled
 * fields made this card four screens tall — "zo krap mogelijk, niet dat ik
 * naar beneden moet gaan scrollen".
 */
type CurRow = { code: string; name: string }
type CatRow = { category: string; label: string; percentage: string }

const GRID = 'grid grid-cols-[58px_1fr_52px_28px] sm:grid-cols-[90px_1fr_90px_36px] gap-1.5 sm:gap-2'

export function CurrencyTaxCard() {
  const { data, isLoading } = useCurrencyTax()
  const { data: presets } = usePricePresets()
  const save = useSaveTaxSettings()

  const [curRows, setCurRows] = useState<CurRow[]>([])
  const [catRows, setCatRows] = useState<CatRow[]>([])

  useEffect(() => {
    if (!data) return
    setCurRows(
      Object.entries(data.currencies)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, t]) => ({ code, name: t.name })),
    )
  }, [data])

  // Every category that exists, so none is silently left without a rate.
  useEffect(() => {
    if (!data || !presets) return
    setCatRows(
      [...presets]
        .sort((a: any, b: any) => String(a.category).localeCompare(String(b.category)))
        .map((p: any) => ({
          category: String(p.category),
          label: String(p.label ?? p.category),
          percentage: String(data.categories[String(p.category).toLowerCase()] ?? 0),
        })),
    )
  }, [data, presets])

  function submit() {
    const currencies: CurrencyTaxMap = {}
    for (const r of curRows) {
      const code = r.code.trim().toUpperCase()
      const name = r.name.trim()
      if (!code) { toast.error('A currency needs a code'); return }
      if (!name) { toast.error(`${code} needs a tax name`); return }
      if (currencies[code]) { toast.error(`${code} is listed twice`); return }
      currencies[code] = { name }
    }
    if (Object.keys(currencies).length === 0) { toast.error('Keep at least one currency'); return }

    const categories: CategoryTaxMap = {}
    for (const r of catRows) {
      const pct = Number(r.percentage)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast.error(`${r.label}: the percentage has to be between 0 and 100`); return
      }
      categories[r.category.toLowerCase()] = pct
    }
    save.mutate({ currencies, categories })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Coins className="h-4 w-4" />
          Tax
        </CardTitle>
        <CardDescription>
          The currency decides the name, the customer category decides the rate.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* ── Name per currency ── */}
            <div className={`${GRID} text-[11px] sm:text-xs text-muted-foreground pb-1 border-b`}>
              <span>Currency</span>
              <span>Tax name</span>
              <span />
              <span />
            </div>
            {curRows.map((r, i) => (
              <div key={`c${i}`} className={`${GRID} items-center`}>
                <Input
                  value={r.code}
                  onChange={e => setCurRows(p => p.map((x, k) => k === i ? { ...x, code: e.target.value.toUpperCase() } : x))}
                  className="h-8 px-1.5 text-sm font-mono uppercase"
                  maxLength={6}
                  aria-label="Currency"
                />
                <Input
                  value={r.name}
                  onChange={e => setCurRows(p => p.map((x, k) => k === i ? { ...x, name: e.target.value } : x))}
                  placeholder="OB, BTW, VAT…"
                  className="h-8 px-2 text-sm"
                  maxLength={20}
                  aria-label="Tax name"
                />
                <span />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-7 p-0 text-muted-foreground hover:text-red-600"
                  onClick={() => setCurRows(p => p.filter((_, k) => k !== i))}
                  aria-label={`Remove ${r.code}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-8 w-full sm:w-auto"
              onClick={() => setCurRows(p => [...p, { code: '', name: '' }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add a currency
            </Button>

            {/* ── Percentage per category ── */}
            <div className={`${GRID} text-[11px] sm:text-xs text-muted-foreground pt-3 pb-1 border-b`}>
              <span className="col-span-2">Customer category</span>
              <span className="text-right">%</span>
              <span />
            </div>
            {catRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No categories yet — add them under Products → Categories.
              </p>
            ) : catRows.map((r, i) => (
              <div key={`k${i}`} className={`${GRID} items-center`}>
                <span className="col-span-2 text-sm truncate" title={r.category}>{r.label}</span>
                <Input
                  value={r.percentage}
                  onChange={e => setCatRows(p => p.map((x, k) => k === i ? { ...x, percentage: e.target.value } : x))}
                  inputMode="decimal"
                  className="h-8 px-1.5 text-sm text-right"
                  aria-label={`${r.label} percentage`}
                />
                <span />
              </div>
            ))}

            <div className="pt-2">
              <Button onClick={submit} disabled={save.isPending} className="w-full sm:w-auto gap-2">
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
