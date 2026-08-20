'use client'

import { useMemo, useState } from 'react'
import {
  CalendarRange, Plus, Pencil, Trash2, Lightbulb, X, Users, Megaphone, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { useCampaigns, useSaveCampaign, useDeleteCampaign, type Campaign } from '@/hooks/use-campaigns'
import { useCustomerNames } from '@/hooks/use-customer-names'
import { useMarketingAssets } from '@/hooks/use-marketing-assets'
import { campaignPeriod, campaignIsLive } from '@/lib/marketing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const EMPTY = {
  name: '', starts_on: '', ends_on: '', goal: '', notes: '',
  ideas: [] as string[],
  visibility: 'all' as 'all' | 'selected' | 'staff',
  customerIds: [] as string[],
  is_active: true,
}

/**
 * Campaigns — an event or a push, with its period, its thinking, and who it is
 * for.
 *
 * The reason this exists rather than tagging assets one by one: a two-month
 * event with a reseller is not one picture. It is posts, stories, a shelf
 * talker, photos of the night itself. Ticking the same shop on thirty assets is
 * how one gets missed, and a missed one is material shown to the wrong shop.
 *
 * So the audience lives here and the assets inherit it. Change it in one place.
 */
export default function CampaignsPage() {
  const { can, isAdmin } = useAuth()
  const canManage = isAdmin || can('marketing.manage')
  // Making a campaign and deciding who it is for are two rights since 086.
  const canAllocate = isAdmin || can('marketing.allocate')

  const { data: campaigns, isLoading } = useCampaigns()
  const { data: resellers } = useCustomerNames()
  const { data: assets } = useMarketingAssets(true)
  const saveCampaign = useSaveCampaign()
  const deleteCampaign = useDeleteCampaign()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [ideaDraft, setIdeaDraft] = useState('')

  const assetCount = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of assets ?? []) {
      if (a.campaign_id) map[a.campaign_id] = (map[a.campaign_id] ?? 0) + 1
    }
    return map
  }, [assets])

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setIdeaDraft('')
    setDialogOpen(true)
  }

  function openEdit(c: Campaign) {
    setEditing(c)
    setForm({
      name: c.name,
      starts_on: c.starts_on ?? '',
      ends_on: c.ends_on ?? '',
      goal: c.goal ?? '',
      notes: c.notes ?? '',
      ideas: c.ideas ?? [],
      visibility: c.visibility,
      customerIds: c.customer_ids ?? [],
      is_active: c.is_active,
    })
    setIdeaDraft('')
    setDialogOpen(true)
  }

  function addIdea() {
    const value = ideaDraft.trim()
    if (!value) return
    setForm(f => ({ ...f, ideas: [...f.ideas, value] }))
    setIdeaDraft('')
  }

  function handleSave() {
    if (!form.name.trim()) { toast.error('Give the campaign a name'); return }
    // Aimed at nobody is not aimed at everybody: it would save and then be
    // invisible to every reseller, with nothing on screen saying why.
    if (form.visibility === 'selected' && form.customerIds.length === 0) {
      toast.error('Pick at least one reseller, or set it to All resellers')
      return
    }
    if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) {
      toast.error('The end date is before the start date')
      return
    }

    saveCampaign.mutate(
      {
        id: editing?.id,
        name: form.name.trim(),
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        goal: form.goal.trim(),
        notes: form.notes.trim(),
        ideas: form.ideas,
        visibility: form.visibility,
        customer_ids: form.customerIds,
        is_active: form.is_active,
        customer_ids_placeholder: undefined,
      } as never,
      {
        onSuccess: () => {
          toast.success(editing ? 'Campaign updated' : 'Campaign created')
          setDialogOpen(false)
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  function audienceLine(c: Campaign) {
    if (c.visibility === 'staff') return 'Internal only'
    if (c.visibility === 'all') return 'All resellers'
    const names = (resellers ?? [])
      .filter(r => c.customer_ids.includes(r.id))
      .map(r => r.company_name)
    if (names.length === 0) return 'Nobody selected yet'
    if (names.length <= 2) return names.join(' and ')
    return `${names[0]}, ${names[1]} and ${names.length - 2} more`
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Campaigns
          </h1>
          <p className="text-muted-foreground text-xs">
            An event or a push, and the material that belongs to it.
          </p>
        </div>
        {canManage && (
          <Button onClick={openNew} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            New campaign
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (campaigns ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Megaphone className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No campaigns yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              A campaign holds the material for one event and decides who sees it.
              Make one, then set an asset to &ldquo;Follow the campaign&rdquo;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(campaigns ?? []).map(c => {
            const live = campaignIsLive(c.starts_on, c.ends_on)
            return (
              <Card key={c.id} className={`py-0 gap-0 ${!c.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{c.name}</p>
                        {live && (
                          <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0 gap-1">
                            <Circle className="h-2 w-2 fill-current" />
                            Running
                          </Badge>
                        )}
                        {!c.is_active && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Archived</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {campaignPeriod(c.starts_on, c.ends_on)}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(c)}
                          className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent"
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Delete "${c.name}"? Its material stays, but stops being shown until you give it a new home.`)) return
                            deleteCampaign.mutate(c.id, {
                              onSuccess: () => toast.success('Campaign deleted'),
                              onError: (err: Error) => toast.error(err.message),
                            })
                          }}
                          className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {c.goal && <p className="text-sm">{c.goal}</p>}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {audienceLine(c)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Megaphone className="h-3 w-3" />
                      {assetCount[c.id] ?? 0} {assetCount[c.id] === 1 ? 'asset' : 'assets'}
                    </span>
                    {c.ideas.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" />
                        {c.ideas.length} {c.ideas.length === 1 ? 'idea' : 'ideas'}
                      </span>
                    )}
                  </div>

                  {c.notes && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap border-l-2 pl-2">
                      {c.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit campaign' : 'New campaign'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. La Bandera × SPika — summer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <Input type="date" value={form.starts_on} onChange={e => setForm(f => ({ ...f, starts_on: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Ends</Label>
                <Input type="date" value={form.ends_on} onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>What is it for</Label>
              <Input
                value={form.goal}
                onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
                placeholder="e.g. two months of visibility, aimed at Saturday nights"
              />
            </div>

            {canAllocate ? (
            <div className="space-y-1.5">
              <Label>Who sees the material</Label>
              <Select
                value={form.visibility}
                onValueChange={v => setForm(f => ({ ...f, visibility: (v as typeof f.visibility) ?? f.visibility }))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string) => v === 'staff' ? 'Internal only' : v === 'selected' ? 'Specific resellers' : 'All resellers'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resellers</SelectItem>
                  <SelectItem value="selected">Specific resellers</SelectItem>
                  <SelectItem value="staff">Internal only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Who sees the material</Label>
                <p className="text-xs text-muted-foreground">
                  All resellers — an admin decides who a campaign is aimed at.
                </p>
              </div>
            )}

            {canAllocate && form.visibility === 'selected' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Which resellers</Label>
                  <span className="text-xs text-muted-foreground">{form.customerIds.length} selected</span>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">
                  {(resellers ?? []).filter(r => !r.is_lead).map(r => (
                    <label key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-accent">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-red-600 shrink-0"
                        checked={form.customerIds.includes(r.id)}
                        onChange={e => setForm(f => ({
                          ...f,
                          customerIds: e.target.checked
                            ? [...f.customerIds, r.id]
                            : f.customerIds.filter(id => id !== r.id),
                        }))}
                      />
                      {/* min-w-0 or `truncate` does nothing: a flex item will
                          not shrink below its content without it, and a long
                          reseller name then pushes the city off the edge and
                          the dialog sideways. */}
                      <span className="text-sm truncate min-w-0 flex-1">{r.company_name}</span>
                      {r.city && <span className="text-xs text-muted-foreground shrink-0">{r.city}</span>}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Every asset set to &ldquo;Follow the campaign&rdquo; moves with this.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What we agreed, what worked, what to do differently"
                rows={3}
              />
            </div>

            {/* Ideas kept apart from notes on purpose: a note is what happened,
                an idea is what might. Mixed together the ideas get buried. */}
            <div className="space-y-1.5">
              <Label>Ideas</Label>
              <div className="flex gap-2">
                <Input
                  value={ideaDraft}
                  onChange={e => setIdeaDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIdea() } }}
                  placeholder="Add one and press Enter"
                />
                <Button type="button" variant="outline" onClick={addIdea}>Add</Button>
              </div>
              {form.ideas.length > 0 && (
                <div className="space-y-1 pt-1">
                  {form.ideas.map((idea, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded-md border px-2 py-1.5">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      <span className="flex-1">{idea}</span>
                      <button
                        onClick={() => setForm(f => ({ ...f, ideas: f.ideas.filter((_, j) => j !== i) }))}
                        className="text-muted-foreground hover:text-red-600 shrink-0"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* items-start, not items-center: the sentence wraps to two lines
                in a narrow dialog and a centred checkbox then floats halfway
                down it. */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 shrink-0 accent-red-600"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-sm min-w-0">
                Active
                <span className="text-muted-foreground"> — switch off to archive it and pull its material from the portal</span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveCampaign.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
