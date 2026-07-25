'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types'
import { can as checkPermission, DEFAULT_ROLE_PERMISSIONS, type PermissionMap } from '@/lib/permissions'

interface AuthContextValue {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: User | null
  isLoading: boolean
  isAdmin: boolean
  isCustomer: boolean
  /** May the signed-in user do this? Admin always true. */
  can: (permission: string) => boolean
  permissions: PermissionMap
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  supabaseUser: null,
  profile: null,
  isLoading: true,
  isAdmin: false,
  isCustomer: false,
  can: () => false,
  permissions: {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Live matrix from role_permissions; falls back to the defaults if the table
  // is not reachable, so the app never renders as if nobody may do anything.
  const [permissions, setPermissions] = useState<PermissionMap>(DEFAULT_ROLE_PERMISSIONS as PermissionMap)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  async function loadPermissions() {
    const { data } = await supabase.from('role_permissions').select('role, permissions')
    if (!data?.length) return
    const map: PermissionMap = {}
    for (const row of data as any[]) map[row.role] = row.permissions ?? []
    setPermissions(map)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session?.user) {
        loadPermissions()
        loadProfile(session.user.id).finally(() => setIsLoading(false))
      } else {
        setIsLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        supabaseUser,
        profile,
        isLoading,
        isAdmin: profile?.role === 'admin',
        isCustomer: profile?.role === 'customer',
        permissions,
        can: (permission: string) => checkPermission(profile?.role, permission, permissions),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
