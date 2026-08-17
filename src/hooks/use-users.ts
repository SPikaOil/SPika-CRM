import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types'

export function useUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // team_members, not users. Migration 076 closed a privilege escalation by
      // rebuilding the users policies as "read your own row, admin writes" —
      // which also meant this query returned exactly one name to anyone who is
      // not an admin, emptying every assign-to dropdown in the app. The view
      // filters out portal accounts itself and lets a colleague see colleagues.
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('name')
      if (error) throw error
      return data as User[]
    },
  })
}
