import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types'

export function useUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // Team members only — never customer-portal accounts (role 'customer'),
      // which would otherwise show up in "assign to worker" dropdowns.
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .neq('role', 'customer')
        .order('name')
      if (error) throw error
      return data as User[]
    },
  })
}
