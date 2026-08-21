'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { CustomerForm } from '../_components/customer-form'
import { useCreateCustomer } from '@/hooks/use-customers'
import { useSetCustomerWarehouses, type Place } from '@/hooks/use-customer-warehouses'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface PossibleDuplicate {
  id: string
  company_name: string
  customer_number: string | null
}

export default function NewCustomerPage() {
  return (
    <Suspense fallback={null}>
      <NewCustomerInner />
    </Suspense>
  )
}

function NewCustomerInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isLead = searchParams.get('lead') === '1'
  const createCustomer = useCreateCustomer()
  const setWarehouses = useSetCustomerWarehouses()
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([])
  const [pendingValues, setPendingValues] = useState<{ values: Partial<Customer>; places: Place[] } | null>(null)

  async function doCreate(values: Partial<Customer>, places: Place[]) {
    const customer = await createCustomer.mutateAsync(values)
    // The warehouses live in their own table, so they can only be written once
    // the customer has an id (migration 109).
    if (places.length > 0) {
      await setWarehouses.mutateAsync({ customerId: customer.id, places })
    }
    router.push(`/customers/${customer.id}`)
  }

  async function onSubmit(values: Partial<Customer>, places: Place[]) {
    // Guard against double customers: compare the new name against every
    // existing customer (case/punctuation-insensitive, both directions)
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const target = norm(values.company_name ?? '')
    const found = (existing ?? []).filter(c => {
      const n = norm(c.company_name ?? '')
      return n && target && (n.includes(target) || target.includes(n))
    })

    if (found.length > 0) {
      setDuplicates(found)
      setPendingValues({ values, places })
      return
    }
    await doCreate(values, places)
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{isLead ? 'New Lead' : 'New Customer'}</h1>
        <p className="text-muted-foreground text-sm">
          {isLead ? 'A potential customer — log your contact and convert them when they buy' : 'Fill in the customer details'}
        </p>
      </div>
      <CustomerForm onSubmit={onSubmit} isLoading={createCustomer.isPending} defaultValues={isLead ? { is_lead: true } as any : undefined} />

      {/* Possible duplicate warning */}
      <Dialog open={pendingValues !== null} onOpenChange={(open) => { if (!open) setPendingValues(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Possible duplicate customer
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A customer with a similar name already exists:
          </p>
          <div className="space-y-1">
            {duplicates.map(d => (
              <a
                key={d.id}
                href={`/customers/${d.id}`}
                className="block rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium">{d.company_name}</span>
                {d.customer_number && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{d.customer_number}</span>
                )}
              </a>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingValues(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={createCustomer.isPending}
              onClick={() => pendingValues && doCreate(pendingValues.values, pendingValues.places)}
            >
              Create anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
