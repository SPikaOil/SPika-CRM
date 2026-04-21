'use client'

import { useRouter } from 'next/navigation'
import { LogOut, User, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'

export function UserMenu() {
  const { profile } = useAuth()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const supabase = createClient()

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      {/* base-ui trigger renders a <button> — style it directly */}
      <DropdownMenuTrigger className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-red-100 text-red-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {profile?.name || 'User'}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {profile?.role || ''}
          </p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="gap-2">
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-600 focus:text-red-600"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
