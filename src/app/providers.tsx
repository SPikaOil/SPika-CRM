'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/contexts/auth-context'
import { getQueryClient } from '@/lib/query-client'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { ServiceWorkerRegister } from '@/components/layout/sw-register'

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
          <ServiceWorkerRegister />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
