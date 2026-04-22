'use client'

import Link from 'next/link'
import { Plus, Target, ChevronRight } from 'lucide-react'
import { useLeads, useUpdateLead } from '@/hooks/use-leads'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Lead, LeadStage } from '@/types'

const STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'won', 'lost']

const stageColors: Record<LeadStage, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  quoted: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
}

export default function LeadsPage() {
  const { data: leads, isLoading } = useLeads()
  const updateLead = useUpdateLead()

  function handleStageChange(id: string, stage: LeadStage) {
    updateLead.mutate({ id, values: { stage } })
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{leads?.length ?? 0} total</p>
        </div>
        <Link href="/leads/new">
          <Button className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : leads?.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
          <Target className="h-12 w-12 opacity-20" />
          <p>No leads yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads?.map((lead) => (
            <div key={lead.id} className="flex items-center gap-3 p-4 rounded-xl border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{lead.customer?.company_name}</p>
                  <Badge className={`text-xs capitalize ${stageColors[lead.stage]}`}>
                    {lead.stage}
                  </Badge>
                  <span className="text-xs text-muted-foreground capitalize">{lead.category}</span>
                </div>
                <p className="text-sm text-muted-foreground">{lead.assigned_user?.name}</p>
                {lead.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{lead.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={lead.stage}
                  onValueChange={(v) => v && handleStageChange(lead.id, v as LeadStage)}
                >
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lead.stage === 'won' && (
                  <Link href={`/quotes/new?customer=${lead.customer_id}&lead=${lead.id}`}>
                    <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-xs gap-1">
                      Quote <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
