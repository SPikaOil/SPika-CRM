'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/contexts/auth-context'
import { getQueryClient } from '@/lib/query-client'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { ServiceWorkerRegister } from '@/components/layout/sw-register'
import { CurrencyTaxLoader } from '@/components/layout/currency-tax-loader'

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
          {/* Fills lib/tax-names with the stored tax per currency, so the PDFs
              — which render outside the React tree — can read it. */}
          <CurrencyTaxLoader />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
