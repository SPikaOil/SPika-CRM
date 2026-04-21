'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useCreateLead } from '@/hooks/use-leads'
import { useCustomers } from '@/hooks/use-customers'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const schema = z.object({
  customer_id: z.string().uuid('Select a customer'),
  category: z.enum(['wholesale', 'horeca', 'dtf', 'other']),
  stage: z.enum(['new', 'contacted', 'quoted', 'won', 'lost']),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

export default function NewLeadPage() {
  const router = useRouter()
  const createLead = useCreateLead()
  const { data: customers } = useCustomers()
  const { profile } = useAuth()

  const { handleSubmit, setValue, watch, register, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { stage: 'new', notes: '' },
    })

  const customerId = watch('customer_id')
  const category = watch('category')
  const stage = watch('stage')

  async function onSubmit(data: FormValues) {
    await createLead.mutateAsync({ ...data, assigned_to: profile?.id! })
    router.push('/leads')
  }

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Lead</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Lead Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={(v) => v && setValue('customer_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => setValue('category', v as any)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="horeca">HORECA</SelectItem>
                  <SelectItem value="dtf">DTF</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage ?? 'new'} onValueChange={(v) => setValue('stage', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['new', 'contacted', 'quoted', 'won', 'lost'].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Any notes about this lead..." rows={3} />
            </div>
          </CardContent>
        </Card>
        <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Lead
        </Button>
      </form>
    </div>
  )
}
