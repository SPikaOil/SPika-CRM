'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SignaturePad from 'signature_pad'
import { PackageCheck, Loader2, Plus, Minus, Check, Clock, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { SPIKA_PRODUCTS } from '@/lib/products'

// Only physical bottle products can be handed over
const HANDOVER_SKUS = SPIKA_PRODUCTS.filter(p => !p.sku.includes('return')).map(p => p.sku)

interface Batch {
  id: string
  batch_number: string | null
  handover_date: string | null
  member_id: string
  items: { sku: string; name: string; qty: number }[]
  notes: string
  signed_at: string | null
  signer_name: string | null
  created_at: string
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function HandoverPage() {
  const { isAdmin, isLoading: authLoading, profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { data: users } = useUsers()

  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  // New batch form
  const [batchNumber, setBatchNumber] = useState('')
  const [handoverDate, setHandoverDate] = useState(todayStr())
  const [memberId, setMemberId] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Signing
  const [signBatch, setSignBatch] = useState<Batch | null>(null)
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  async function loadBatches() {
    const { data } = await supabase.from('handover_batches').select('*').order('created_at', { ascending: false })
    setBatches((data as Batch[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { loadBatches() /* eslint-disable-next-line */ }, [])

  useEffect(() => {
    if (signBatch && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, { backgroundColor: 'rgba(255,255,255,0)', penColor: '#1a1a1a' })
      const canvas = canvasRef.current
      const ratio = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      sigPadRef.current.clear()
    }
    return () => { sigPadRef.current?.off() }
  }, [signBatch])

  const salesTeam = (users ?? []).filter(u => (u.role === 'sales' || u.role === 'admin') && (u as any).is_active !== false)
  const memberName = (id: string) => users?.find(u => u.id === id)?.name ?? 'Unknown'

  function adjust(sku: string, delta: number) {
    setQtys(prev => ({ ...prev, [sku]: Math.max(0, (prev[sku] ?? 0) + delta) }))
  }

  async function createBatch() {
    if (!memberId) { toast.error('Select a team member'); return }
    const items = HANDOVER_SKUS
      .filter(sku => (qtys[sku] ?? 0) > 0)
      .map(sku => ({ sku, name: SPIKA_PRODUCTS.find(p => p.sku === sku)!.name, qty: qtys[sku] }))
    if (items.length === 0) { toast.error('Add at least one bottle'); return }
    setCreating(true)
    const { error } = await supabase.from('handover_batches').insert({
      batch_number: batchNumber.trim() || null,
      handover_date: handoverDate || null,
      member_id: memberId, items, notes, created_by: profile?.id,
    })
    setCreating(false)
    if (error) { toast.error(error.message); return }
    toast.success('Handover batch created')
    setBatchNumber(''); setHandoverDate(todayStr()); setMemberId(''); setQtys({}); setNotes('')
    loadBatches()
  }

  async function confirmSign() {
    if (!signBatch || !sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('Please capture a signature'); return
    }
    setSigning(true)
    try {
      const dataUrl = sigPadRef.current.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      const path = `handover/${signBatch.id}.png`
      const { error: upErr } = await supabase.storage.from('pod-files').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('pod-files').getPublicUrl(path)
      const signedAt = new Date().toISOString()
      const { error } = await supabase.from('handover_batches').update({
        signature_url: urlData.publicUrl, signer_name: memberName(signBatch.member_id), signed_at: signedAt,
      }).eq('id', signBatch.id)
      if (error) throw error

      // Email the member a receipt of what they took (fire-and-forget)
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'handover_receipt',
          payload: {
            memberId: signBatch.member_id,
            batchNumber: signBatch.batch_number,
            items: signBatch.items,
            signedAt: new Date(signedAt).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            notes: signBatch.notes,
          },
        }),
      }).catch(() => {})

      toast.success('Signed — receipt e-mailed to the team member')
      setSignBatch(null)
      loadBatches()
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save signature')
    } finally {
      setSigning(false)
    }
  }

  if (authLoading || !isAdmin) return null

  const pending = batches.filter(b => !b.signed_at)
  const done = batches.filter(b => b.signed_at)

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-red-600" /> Handover Btls
        </h1>
        <p className="text-muted-foreground text-sm">Bottles ready for pick-up, allocated to the sales team</p>
      </div>

      {/* New batch */}
      <Card className="py-3 gap-2">
        <CardHeader><CardTitle className="text-sm">New handover</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Batch number</Label>
              <Input value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="e.g. P-2026-014" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} className="h-9 w-40" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Allocate to</Label>
            <Select value={memberId} onValueChange={v => setMemberId(v ?? '')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {salesTeam.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            {HANDOVER_SKUS.map(sku => {
              const p = SPIKA_PRODUCTS.find(x => x.sku === sku)!
              const q = qtys[sku] ?? 0
              return (
                <div key={sku} className="flex items-center gap-2">
                  <p className="flex-1 text-sm truncate">{p.name}</p>
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => adjust(sku, -1)}><Minus className="h-3 w-3" /></Button>
                  <Input type="number" value={q} onChange={e => setQtys(prev => ({ ...prev, [sku]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="h-7 w-14 text-center px-1" />
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => adjust(sku, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
              )
            })}
          </div>
          <Input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="h-9" />
          <Button className="bg-red-600 hover:bg-red-700 w-full" onClick={createBatch} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Create handover</>}
          </Button>
        </CardContent>
      </Card>

      {/* Pending signature */}
      {loading ? <Skeleton className="h-20 rounded-xl" /> : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Awaiting signature</p>
              {pending.map(b => (
                <Card key={b.id} className="py-0">
                  <CardContent className="py-2.5 px-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{memberName(b.member_id)}</p>
                        {b.batch_number && <span className="font-mono text-xs text-muted-foreground shrink-0">{b.batch_number}</span>}
                        {b.handover_date && <span className="text-xs text-muted-foreground shrink-0">{new Date(b.handover_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                      </p>
                    </div>
                    <Badge className="bg-orange-500 text-white text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 shrink-0" onClick={() => setSignBatch(b)}>Sign</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Handed over</p>
              {done.map(b => (
                <Card key={b.id} className="py-0 opacity-80">
                  <CardContent className="py-2.5 px-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{memberName(b.member_id)}</p>
                        {b.batch_number && <span className="font-mono text-xs text-muted-foreground shrink-0">{b.batch_number}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                      </p>
                    </div>
                    <Badge className="bg-green-600 text-white text-xs shrink-0"><Check className="h-3 w-3 mr-1" />
                      {b.signed_at ? new Date(b.signed_at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : 'Signed'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Signature dialog */}
      {signBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="font-semibold text-sm">Sign for receipt — {memberName(signBatch.member_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {signBatch.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSignBatch(null)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                By signing, {memberName(signBatch.member_id)} confirms receipt of these bottles for delivery.
              </p>
              <canvas ref={canvasRef} className="w-full h-40 rounded-lg border bg-white touch-none" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => sigPadRef.current?.clear()}>Clear</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={confirmSign} disabled={signing}>
                  {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Confirm</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
