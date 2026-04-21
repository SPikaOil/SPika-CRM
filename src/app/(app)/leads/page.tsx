'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Target, ChevronRight } from 'lucide-react'
import { useLeads } from '@/hooks/use-leads'
import { useUpdateLead } from '@/hooks/use-leads'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lead, LeadStage } from '@/types'

const STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'won', 'lost']

const stageColors: Record<LeadStage, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  quoted: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
}

function LeadCard({ lead, onStageChange }: { lead: Lead; onStageChange: (stage: LeadStage) => void }) {
  return (
    <div className="p-4 rounded-xl border bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {lead.customer?.company_name ?? 'Unknown Customer'}
          </p>
          <p className="text-sm text-muted-foreground capitalize">
            {lead.category} · {lead.assigned_user?.name ?? '—'}
          </p>
        </div>
        <Badge className={`text-xs capitalize shrink-0 ${stageColors[lead.stage]}`}>
          {lead.stage}
        </Badge>
      </div>
      {lead.notes && (
        <p className="text-sm text-muted-foreground line-clamp-2">{lead.notes}</p>
      )}
      <div className="flex items-center gap-2">
        <Select value={lead.stage} onValueChange={(v) => onStageChange(v as LeadStage)}>
          <SelectTrigger className="h-8 text-xs flex-1">
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
  )
}

function KanbanColumn({ stage, leads, onStageChange }: {
  stage: LeadStage
  leads: Lead[]
  onStageChange: (id: string, stage: LeadStage) => void
}) {
  return (
    <div className="flex-1 min-w-64 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={`capitalize ${stageColors[stage]}`}>{stage}</Badge>
          <span className="text-sm text-muted-foreground">{leads.length}</span>
        </div>
      </div>
      <div className="space-y-2 min-h-20">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onStageChange={(s) => onStageChange(lead.id, s)}
          />
        ))}
        {leads.length === 0 && (
          <div className="border-2 border-dashed rounded-xl p-4 text-center text-muted-foreground text-sm">
            No leads
          </div>
        )}
      </div>
    </div>
  )
}

export default function LeadsPage() {
  const { data: leads, isLoading } = useLeads()
  const updateLead = useUpdateLead()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  function handleStageChange(id: string, stage: LeadStage) {
    updateLead.mutate({ id, values: { stage } })
  }

  const leadsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = leads?.filter((l) => l.stage === stage) ?? []
    return acc
  }, {} as Record<LeadStage, Lead[]>)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{leads?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link href="/leads/new">
            <Button className="bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4 mr-2" />
              New Lead
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => (
            <div key={s} className="flex-1 min-w-64 space-y-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ))}
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={leadsByStage[stage]}
              onStageChange={handleStageChange}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {leads?.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
              <Target className="h-12 w-12 opacity-20" />
              <p>No leads yet</p>
            </div>
          ) : (
            leads?.map((lead) => (
              <div key={lead.id} className="flex items-center gap-4 p-4 rounded-xl border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{lead.customer?.company_name}</p>
                    <Badge className={`text-xs capitalize ${stageColors[lead.stage]}`}>{lead.stage}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{lead.category}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{lead.assigned_user?.name}</p>
                </div>
                <Select value={lead.stage} onValueChange={(v) => handleStageChange(lead.id, v as LeadStage)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
