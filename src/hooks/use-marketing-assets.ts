import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MarketingAsset } from '@/types'
import { toast } from 'sonner'

/**
 * @param staffView  true for the CRM tab (sees everything), false for the
 *                   portal (never sees `visibility: 'staff'` rows).
 */
export function useMarketingAssets(staffView: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['marketing-assets', staffView],
    queryFn: async () => {
      const query = supabase
        .from('marketing_assets')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      // No visibility filter for the portal any more. Since migration 085 an
      // asset can be aimed at named resellers or follow a campaign, and only
      // the database knows which of those apply to THIS login. Filtering here
      // for visibility = all would hide exactly the material we just built the
      // aiming for. The staff view still asks for everything; the read policy
      // decides what comes back.

      const { data, error } = await query
      if (error) throw error
      return data as MarketingAsset[]
    },
  })
}

export function useCreateMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<MarketingAsset>) => {
      const { data, error } = await supabase
        .from('marketing_assets')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as MarketingAsset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<MarketingAsset> }) => {
      const { error } = await supabase.from('marketing_assets').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Soft delete. An asset that was pulled back is still referenced by whoever
 * already downloaded it, and the download count is worth keeping.
 */
export function useDeleteMarketingAsset() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_assets').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
      toast.success('Asset removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Counts a download. Deliberately fire-and-forget on the CLIENT — this runs in
 * the browser next to a link the user already clicked, so a failed count must
 * never hold up or break their download. Not a server route: see AGENTS note in
 * the migration about why this uses a SECURITY DEFINER function.
 */
export function useTrackDownload() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return async (assetId: string) => {
    const { error } = await supabase.rpc('bump_marketing_download', { asset_id: assetId })
    if (!error) queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
  }
}

/**
 * Which resellers each asset is aimed at, in one query rather than one per card.
 *
 * A reseller reading this gets only the rows that name THEM — the policy on
 * marketing_asset_customers says so — which is enough for the portal to mark a
 * card "for you" without ever showing who else is on the list.
 */
export function useAssetAudiences() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['marketing-asset-audiences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_asset_customers')
        .select('asset_id, customer_id')
      // The table only exists after migration 085. Until then every asset is
      // simply aimed at everyone, which is what the app did before.
      if (error) return {} as Record<string, string[]>
      const map: Record<string, string[]> = {}
      for (const row of data ?? []) {
        (map[row.asset_id] ??= []).push(row.customer_id)
      }
      return map
    },
  })
}

/**
 * Replace an asset's audience. A replace and not a merge: what is ticked in the
 * form IS the audience, so unticking somebody has to take them off the list.
 */
export function useSaveAssetAudience() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, customerIds, visibility }: {
      assetId: string; customerIds: string[]; visibility: string
    }) => {
      await supabase.from('marketing_asset_customers').delete().eq('asset_id', assetId)
      if (visibility !== 'selected' || customerIds.length === 0) return
      const { error } = await supabase
        .from('marketing_asset_customers')
        .insert(customerIds.map(customer_id => ({ asset_id: assetId, customer_id })))
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-asset-audiences'] })
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
    },
  })
}
