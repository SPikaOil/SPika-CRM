import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Visibility } from '@/lib/marketing'

export interface Campaign {
  id: string
  created_at: string
  updated_at: string
  name: string
  starts_on: string | null
  ends_on: string | null
  goal: string
  notes: string
  ideas: string[]
  visibility: Exclude<Visibility, 'campaign'>
  is_active: boolean
  created_by: string | null
  /** Filled in by the hook, not a column — see below. */
  customer_ids: string[]
}

/**
 * Campaigns with their audience.
 *
 * The audience lives in a link table rather than an array column, so a customer
 * that is deleted takes its own row with it instead of leaving a dead id behind
 * in thirty campaigns. Cost: one extra query, joined up here so no screen has
 * to think about it.
 */
export function useCampaigns() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .order('starts_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error

      const { data: links } = await supabase
        .from('marketing_campaign_customers')
        .select('campaign_id, customer_id')

      const byCampaign = new Map<string, string[]>()
      for (const l of links ?? []) {
        const list = byCampaign.get(l.campaign_id) ?? []
        list.push(l.customer_id)
        byCampaign.set(l.campaign_id, list)
      }

      return (data ?? []).map(c => ({
        ...c,
        ideas: Array.isArray(c.ideas) ? c.ideas : [],
        customer_ids: byCampaign.get(c.id) ?? [],
      })) as Campaign[]
    },
  })
}

type CampaignInput = Omit<Campaign, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string }

/**
 * Saving the audience is a replace, not a merge: whatever is ticked in the form
 * IS the audience. Unticking someone has to remove them, and a merge would
 * quietly keep them on the list.
 */
async function writeAudience(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  customerIds: string[],
  visibility: string,
) {
  await supabase.from('marketing_campaign_customers').delete().eq('campaign_id', campaignId)
  if (visibility !== 'selected' || customerIds.length === 0) return
  const { error } = await supabase
    .from('marketing_campaign_customers')
    .insert(customerIds.map(customer_id => ({ campaign_id: campaignId, customer_id })))
  if (error) throw error
}

export function useSaveCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CampaignInput) => {
      const { customer_ids, id, ...row } = input
      const payload = { ...row, updated_at: new Date().toISOString() }

      const { data, error } = id
        ? await supabase.from('marketing_campaigns').update(payload).eq('id', id).select('id').single()
        : await supabase.from('marketing_campaigns').insert(payload).select('id').single()
      if (error) throw error

      await writeAudience(supabase, data.id, customer_ids, row.visibility)
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      // An asset set to "follow the campaign" changes audience when the
      // campaign does, so the asset list is stale the moment this saves.
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
    },
  })
}

export function useDeleteCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Assets keep existing; the foreign key is ON DELETE SET NULL. They fall
      // back to whatever their own visibility says, which for a campaign asset
      // is 'campaign' with nothing to point at — so it shows to nobody until
      // somebody gives it a new home. Deliberately not a cascade: material
      // should never disappear because a campaign was tidied away.
      const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['marketing-assets'] })
    },
  })
}
