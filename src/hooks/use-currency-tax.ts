import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  CURRENCY_TAX_KEY,
  CATEGORY_TAX_KEY,
  DEFAULT_CURRENCY_TAX,
  DEFAULT_CATEGORY_TAX,
  setCurrencyTaxConfig,
  setCategoryTaxConfig,
  type CurrencyTax,
} from '@/lib/tax-names'

/**
 * The tax settings: which name each currency uses, and which percentage each
 * customer category carries. Stored in app_settings under two keys, so no
 * table of its own and no migration.
 *
 * Who may change them is already decided: app_settings accepts a write only
 * from someone with `settings.view` (migration 077), and no role but admin
 * holds that permission. The Settings page redirects everyone else away on top
 * of that. Her rule of 2026-11-06: "permissions kan enkel admin dit aanpassen."
 *
 * app_settings.value is a TEXT column (migration 040), not jsonb — so what
 * comes back is a string holding JSON, and what goes in has to be one too.
 * Reading it as an object silently returned the defaults and threw away
 * whatever had been saved.
 */
export type CurrencyTaxMap = Record<string, CurrencyTax>
export type CategoryTaxMap = Record<string, number>

function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return null }
}

function cleanCurrencies(raw: unknown): CurrencyTaxMap {
  const parsed = parse(raw)
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CURRENCY_TAX }
  const out: CurrencyTaxMap = {}
  for (const [code, v] of Object.entries(parsed as Record<string, any>)) {
    const name = String(v?.name ?? '').trim()
    if (!code.trim() || !name) continue
    out[code.trim().toUpperCase()] = { name }
  }
  return Object.keys(out).length > 0 ? out : { ...DEFAULT_CURRENCY_TAX }
}

function cleanCategories(raw: unknown): CategoryTaxMap {
  const parsed = parse(raw)
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CATEGORY_TAX }
  const out: CategoryTaxMap = {}
  for (const [cat, v] of Object.entries(parsed as Record<string, any>)) {
    const pct = Number(v)
    if (!cat.trim() || !Number.isFinite(pct) || pct < 0 || pct > 100) continue
    out[cat.trim().toLowerCase()] = pct
  }
  return out
}

async function readSetting(supabase: ReturnType<typeof createClient>, key: string) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return null
  return (data as { value: unknown }).value
}

export function useCurrencyTax() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['app_settings', 'tax'],
    queryFn: async () => {
      const [cur, cat] = await Promise.all([
        readSetting(supabase, CURRENCY_TAX_KEY),
        readSetting(supabase, CATEGORY_TAX_KEY),
      ])
      const currencies = cleanCurrencies(cur)
      const categories = cat === null ? { ...DEFAULT_CATEGORY_TAX } : cleanCategories(cat)
      setCurrencyTaxConfig(currencies)
      setCategoryTaxConfig(categories)
      return { currencies, categories }
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSaveTaxSettings() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ currencies, categories }: { currencies: CurrencyTaxMap; categories: CategoryTaxMap }) => {
      const cur = cleanCurrencies(currencies)
      const cat = cleanCategories(categories)
      const now = new Date().toISOString()
      // Stringified on purpose: the column is TEXT, not jsonb.
      const { error } = await supabase.from('app_settings').upsert(
        [
          { key: CURRENCY_TAX_KEY, value: JSON.stringify(cur), updated_at: now },
          { key: CATEGORY_TAX_KEY, value: JSON.stringify(cat), updated_at: now },
        ],
        { onConflict: 'key' },
      )
      // Checked, not assumed: Supabase RETURNS an error rather than throwing
      // one, so a write that was refused reads exactly like one that worked.
      if (error) throw new Error(error.message)
      setCurrencyTaxConfig(cur)
      setCategoryTaxConfig(cat)
      return { currencies: cur, categories: cat }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app_settings', 'tax'] })
      toast.success('Tax settings saved')
    },
    onError: (err: Error) => toast.error(`Not saved: ${err.message}`),
  })
}
