'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Building2 } from 'lucide-react'
import { useCustomers } from '@/hooks/use-customers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CustomerCategory } from '@/types'

const categoryColors: Record<CustomerCategory | 'other', string> = {
  wholesale: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  horeca: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  dtf: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const { data: customers, isLoading } = useCustomers(search, category)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">
            {customers?.length ?? 0} total
          </p>
        </div>
        <Link href="/customers/new">
          <Button className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="horeca">HORECA</SelectItem>
            <SelectItem value="dtf">DTF</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : customers?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="font-medium">No customers found</p>
          <p className="text-sm">Add your first customer to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers?.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <span className="text-red-700 dark:text-red-300 font-semibold text-sm">
                  {customer.company_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{customer.company_name}</p>
                  <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${categoryColors[customer.customer_category]}`}
                  >
                    {customer.customer_category}
                  </Badge>
                  {customer.status === 'inactive' && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {customer.contact_person}
                  {customer.phone && ` · ${customer.phone}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
