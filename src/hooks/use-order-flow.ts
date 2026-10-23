import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { computeOrderFlow, type FlowOrder, type OrderFlow } from '@/lib/order-flow'

/**
 * "Cash payments" is not a shop.
 *
 * It is one customer record that every walk-in cash sale is booked against, so
 * its "rhythm" is the rhythm of strangers and there is nobody to phone when it
 * goes quiet. Her instruction of 2026-10-22: take it out.
 *
 * By id and not by name: there is one database behind both the local app and
 * production, so the id is exact and can never catch a real shop that happens
 * to have the word cash in its name.
 */
const CASH_PAYMENTS_ID = 'c2c45cb1-0d07-44e4-a126-a36e01486101'

export interface CustomerFlow {
  customerId: string
  companyName: string
  category: string
  status: string
  flow: OrderFlow
}

/**
 * Every customer with their order flow, in two queries.
 *
 * Deliberately NOT `useOrders()`: that one joins the whole customer, the
 * assigned user and every delivery onto each row, and this screen needs none of
 * it. Only the columns the maths actually uses are asked for.
 *
 * Leads are left out — a lead has no buying rhythm yet, that is what makes it a
 * lead. `useCustomers` excludes them by default for the same reason.
 */
export function useCustomerFlows() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['customer-flows'],
    queryFn: async (): Promise<CustomerFlow[]> => {
      const [custRes, orderRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, company_name, customer_category, status, is_lead')
          .order('company_name'),
        supabase
          .from('orders')
          .select('id, customer_id, status, total, fx_rate, currency, order_type, items, created_at, invoice_date, deleted_at'),
      ])
      if (custRes.error) throw custRes.error
      if (orderRes.error) throw orderRes.error

      const byCustomer = new Map<string, FlowOrder[]>()
      for (const o of orderRes.data ?? []) {
        const id = (o as { customer_id?: string }).customer_id
        if (!id) continue
        const list = byCustomer.get(id) ?? []
        list.push(o as FlowOrder)
        byCustomer.set(id, list)
      }

      return (custRes.data ?? [])
        .filter(c => !(c as { is_lead?: boolean }).is_lead)
        .filter(c => (c as { id: string }).id !== CASH_PAYMENTS_ID)
        .map(c => {
          const row = c as { id: string; company_name: string; customer_category: string; status: string }
          return {
            customerId: row.id,
            companyName: row.company_name,
            category: row.customer_category,
            status: row.status,
            flow: computeOrderFlow(byCustomer.get(row.id) ?? []),
          }
        })
    },
  })
}
