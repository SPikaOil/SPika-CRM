'use client'

import { useRouter } from 'next/navigation'
import { CustomerForm } from '../_components/customer-form'
import { useCreateCustomer } from '@/hooks/use-customers'
import { Customer } from '@/types'

export default function NewCustomerPage() {
  const router = useRouter()
  const createCustomer = useCreateCustomer()

  async function onSubmit(values: Partial<Customer>) {
    const customer = await createCustomer.mutateAsync(values)
    router.push(`/customers/${customer.id}`)
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Customer</h1>
        <p className="text-muted-foreground text-sm">Fill in the customer details</p>
      </div>
      <CustomerForm onSubmit={onSubmit} isLoading={createCustomer.isPending} />
    </div>
  )
}
