'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle,
  Loader2,
  MapPin,
  Info,
  PenLine,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import SignaturePad from 'signature_pad'
import { toast } from 'sonner'
import { useOrder } from '@/hooks/use-orders'
import { useCustomerSigners, useHideCustomerSigner } from '@/hooks/use-customer-signers'
import { createClient } from '@/lib/supabase/client'
import { queuePodUpload, processQueue } from '@/lib/offline-queue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

type Step = 'start' | 'table_bottles' | 'pod' | 'done'
type PodMode = 'signature' | 'photo'

export default function DeliveryPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = use(params)
  const { data: order, isLoading, refetch } = useOrder(orderId)
  const { data: knownSigners } = useCustomerSigners((order as any)?.customer_id)
  const { isAdmin } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const hideSigner = useHideCustomerSigner()
  const [signerToRemove, setSignerToRemove] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('start')
  const [resumedFromOutForDelivery, setResumedFromOutForDelivery] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [gps, setGps] = useState<GeolocationCoordinates | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)

  // Table bottles
  const [tablBottlesReturned, setTableBottlesReturned] = useState(0)
  const [tableBottlesNotes, setTableBottlesNotes] = useState('')

  // POD
  const [podMode, setPodMode] = useState<PodMode>('signature')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [signerName, setSignerName] = useState('')

  // Signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  // Auto-resume: if order is already out_for_delivery, skip straight to POD
  useEffect(() => {
    if (!order || resumedFromOutForDelivery) return
    if (order.status === 'out_for_delivery' && step === 'start') {
      setResumedFromOutForDelivery(true)
      if (order?.customer?.track_table_bottles) {
        setStep('table_bottles')
      } else {
        setStep('pod')
      }
    }
  }, [order])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const onOnline = () => {
      setIsOnline(true)
      syncQueue()
    }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (step === 'pod' && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#1a1a1a',
      })
      resizeCanvas()
    }
    return () => {
      sigPadRef.current?.off()
    }
  }, [step])

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    sigPadRef.current?.clear()
  }

  async function captureGps(): Promise<GeolocationCoordinates> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  // Items that are actually being delivered (positive qty, no returns) — each
  // needs a THT date before the delivery may start.
  const deliveryItems = ((order?.items as any[]) ?? []).filter(i => (i.qty ?? 0) > 0 && !String(i.sku).includes('return'))
  const missingTht = deliveryItems.some(i => !i.tht_date)

  async function updateItemTht(sku: string, tht_date: string) {
    const newItems = ((order?.items as any[]) ?? []).map(i => i.sku === sku ? { ...i, tht_date: tht_date || undefined } : i)
    await supabase.from('orders').update({ items: newItems }).eq('id', orderId)
    refetch()
  }

  async function handleStartDelivery(simulate = false) {
    if (missingTht) { toast.error('Fill in the THT for every product before starting'); return }
    setGpsLoading(true)
    setGpsError('')
    try {
      let coords: GeolocationCoordinates | null = null

      if (!simulate) {
        try {
          coords = await captureGps()
          setGps(coords)
        } catch {
          // GPS not available — continue with null location
          toast('GPS unavailable — continuing without location', { icon: '📍' })
        }
      } else {
        // Simulated location: Willemstad, Curaçao
        const simulated = { latitude: 12.1224, longitude: -68.8824, accuracy: 10 } as GeolocationCoordinates
        setGps(simulated)
        coords = simulated
        toast('Using simulated GPS location (Willemstad)', { icon: '📍' })
      }

      // Update order status
      await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId)

      // Create delivery record
      await supabase.from('deliveries').upsert({
        order_id: orderId,
        delivery_started_at: new Date().toISOString(),
        gps_location: coords
          ? { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }
          : null,
      }, { onConflict: 'order_id' })

      toast.success('Delivery started!')
      if (order?.customer?.track_table_bottles) {
        setStep('table_bottles')
      } else {
        setStep('pod')
      }
    } catch (err: any) {
      setGpsError(err.message ?? 'Could not start delivery')
      toast.error('Failed to start delivery')
    } finally {
      setGpsLoading(false)
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadToSupabase(blob: Blob, fileName: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('pod-files')
      .upload(fileName, blob, { upsert: true })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('pod-files').getPublicUrl(data.path)
    return urlData.publicUrl
  }

  async function syncQueue() {
    await processQueue(async (item) => {
      const url = await uploadToSupabase(item.podBlob, item.podFileName)
      await supabase.from('deliveries').update({
        ...item.deliveryData,
        pod_file_url: url,
      }).eq('order_id', item.orderId)
    })
  }

  async function handleCompleteDelivery() {
    if (missingTht) {
      toast.error('Fill in the THT for every product before completing')
      return
    }
    if (!signerName.trim()) {
      toast.error('Please enter the name of the person signing')
      return
    }
    if (podMode === 'signature' && (!sigPadRef.current || sigPadRef.current.isEmpty())) {
      toast.error('Please have the customer sign first')
      return
    }
    if (order?.customer?.require_delivery_photo && !photoFile) {
      toast.error('A delivery photo is required for this customer')
      return
    }

    setUploading(true)
    try {
      // Capture GPS silently at the moment of signing (non-blocking if unavailable)
      let signatureLocation: { lat: number; lng: number; accuracy: number } | null = null
      try {
        const sigCoords = await captureGps()
        signatureLocation = { lat: sigCoords.latitude, lng: sigCoords.longitude, accuracy: sigCoords.accuracy }
      } catch {
        // GPS unavailable at signing — non-fatal, we already have the start location
      }

      let podBlob: Blob
      let signatureDataUrl: string | undefined
      const fileName = `pod/${orderId}-${Date.now()}.png`

      if (podMode === 'signature') {
        signatureDataUrl = sigPadRef.current!.toDataURL('image/png')
        const res = await fetch(signatureDataUrl)
        podBlob = await res.blob()
      } else {
        podBlob = photoFile!
      }

      const deliveryData = {
        table_bottles_returned: tablBottlesReturned,
        table_bottles_notes: tableBottlesNotes,
        pod_type: podMode,
        delivered_at: new Date().toISOString(),
        notes: deliveryNotes,
        signer_name: signerName.trim(),
        gps_location: gps
          ? { lat: gps.latitude, lng: gps.longitude, accuracy: gps.accuracy }
          : null,
        signature_location: signatureLocation,
      }

      if (isOnline) {
        // Upload signature/photo
        const podUrl = await uploadToSupabase(podBlob, fileName)

        // Generate signed PDF with signature + photo embedded
        let signedPdfUrl: string | undefined
        if (order) {
          try {
            const React = await import('react')
            const { pdf } = await import('@react-pdf/renderer')
            const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

            // Fetch company settings
            const { data: companyData } = await supabase.from('company_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single()
            const company = companyData ?? undefined

            // Convert photo to data URL for embedding in PDF, downscaled so the
            // signed invoice stays small enough to share on iOS
            let deliveryPhotoDataUrl: string | undefined
            if (photoFile) {
              const raw = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(photoFile)
              })
              const { downscaleDataUrl } = await import('@/lib/image-utils')
              deliveryPhotoDataUrl = await downscaleDataUrl(raw)
            }

            const pdfBlob = await (pdf as any)(
              React.createElement(DeliveryNotePDF as any, {
                order,
                signatureDataUrl,
                tableBottlesReturned: tablBottlesReturned,
                tableBottlesNotes,
                signerName: signerName.trim(),
                deliveryPhotoDataUrl,
                company,
                documentType: 'INVOICE',
              })
            ).toBlob()
            const safeOrder = (order.order_number ?? orderId.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
            const safeCust = (order.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
            const signedPdfName = `signed-notes/${safeCust ? `${safeOrder} - ${safeCust}` : safeOrder}.pdf`
            signedPdfUrl = await uploadToSupabase(pdfBlob, signedPdfName)
          } catch (pdfErr) {
            console.error('PDF generation failed:', pdfErr)
            // Non-fatal — delivery still completes
          }
        }

        await supabase.from('deliveries').update({
          ...deliveryData,
          pod_file_url: podUrl,
        }).eq('order_id', orderId)

        await supabase.from('orders').update({
          status: 'delivered',
          ...(signedPdfUrl ? { signed_pdf_url: signedPdfUrl } : {}),
          ...(signatureDataUrl ? { signature_data_url: signatureDataUrl } : {}),
        } as any).eq('id', orderId)

        // Notify admin + customer (fire-and-forget)
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_delivered',
            payload: {
              orderNumber: order?.order_number ?? orderId,
              customerName: order?.customer?.company_name ?? '',
              customerEmail: (order?.customer as any)?.email ?? '',
              billingEmails: (order?.customer as any)?.billing_emails ?? [],
            },
          }),
        }).catch(() => {})

        toast.success('Delivery completed — signed invoice saved!')
      } else {
        await queuePodUpload({
          id: `${orderId}-${Date.now()}`,
          orderId,
          deliveryData: deliveryData as any,
          podBlob,
          podFileName: fileName,
        })
        toast.success('Saved offline — will sync when connected', { duration: 5000 })
      }

      await refetch()
      setStep('done')
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const stepNumber = { start: 1, table_bottles: 2, pod: 3, done: 4 }[step]
  const totalSteps = order?.customer?.track_table_bottles ? 4 : 3

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-4 flex flex-col items-center py-20 gap-3">
        <p>Order not found</p>
        <Link href="/delivery-notes"><Button variant="outline">Back</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="font-bold">{order.order_number}</p>
            <p className="text-sm text-muted-foreground">{order.customer?.company_name}</p>
          </div>
          <Badge variant={isOnline ? 'outline' : 'secondary'} className="gap-1 text-xs">
            {isOnline ? <Wifi className="h-3 w-3 text-green-600" /> : <WifiOff className="h-3 w-3 text-red-600" />}
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </div>
        <div className="max-w-lg mx-auto mt-2">
          <Progress value={(stepNumber / totalSteps) * 100} className="h-1.5" />
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">

        {/* Step 1: Start */}
        {step === 'start' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-600" />
                Step 1 — Start Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-medium">{order.customer?.company_name}</p>
                {(() => {
                  const addr = order.customer?.delivery_address as any
                  return addr?.street ? (
                    <p className="text-sm text-muted-foreground">
                      {addr.street}, {addr.zip} {addr.city}
                    </p>
                  ) : null
                })()}
                {order.customer?.delivery_time_window && (
                  <p className="text-sm text-muted-foreground">
                    Window: {order.customer.delivery_time_window}
                  </p>
                )}
              </div>

              {order.customer?.hardcopy_required && (
                <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <span className="text-xl shrink-0">🖨️</span>
                  <div>
                    <p className="font-semibold text-orange-700 dark:text-orange-400 text-sm">Hard Copy Required</p>
                    <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                      This customer requires a printed delivery note. Make sure you have a hard copy with you before starting the delivery.
                    </p>
                  </div>
                </div>
              )}

              {/* THT check — required before the delivery may start */}
              <div className={`rounded-lg border p-3 space-y-2 ${missingTht ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-green-200 bg-green-50/50 dark:bg-green-950/20'}`}>
                <p className={`text-sm font-semibold flex items-center gap-1.5 ${missingTht ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                  <Calendar className="h-4 w-4" />
                  {missingTht ? 'Fill in the THT before starting' : 'THT confirmed'}
                </p>
                {deliveryItems.map((item: any) => (
                  <div key={item.sku} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{item.name}</span>
                    <Input
                      type="date"
                      value={item.tht_date ?? ''}
                      onChange={e => updateItemTht(item.sku, e.target.value)}
                      className={`h-8 w-40 text-sm px-2 shrink-0 ${!item.tht_date ? 'border-red-400' : ''}`}
                    />
                  </div>
                ))}
              </div>

              {gpsError && (
                <p className="text-sm text-destructive">{gpsError}</p>
              )}

              <Button
                className="w-full h-14 text-lg bg-red-600 hover:bg-red-700 gap-2"
                onClick={() => handleStartDelivery(false)}
                disabled={gpsLoading || missingTht}
              >
                {gpsLoading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Starting...</>
                ) : (
                  <><MapPin className="h-5 w-5" /> Start Delivery</>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => handleStartDelivery(true)}
                disabled={gpsLoading || missingTht}
              >
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Simulate GPS &amp; Start
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Use "Simulate GPS" to test the delivery flow without real location
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Table Bottles */}
        {/* Known contacts at this customer — shown after GPS so you arrive knowing their names */}
        {(step === 'table_bottles' || step === 'pod') && knownSigners && knownSigners.length > 0 && (
          <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="py-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <PenLine className="h-3.5 w-3.5" /> Usually signs here
              </p>
              <div className="flex flex-wrap gap-1.5">
                {knownSigners.slice(0, 6).map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-background border text-xs">
                    <span className="font-medium">{s.name}</span>
                    {s.last && (
                      <span className="text-muted-foreground">· {new Date(s.last).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</span>
                    )}
                    {/* Admin only — drop this person from the customer's signer list */}
                    {isAdmin && (
                      <button
                        type="button"
                        title={`Remove ${s.name}`}
                        aria-label={`Remove ${s.name}`}
                        onClick={() => setSignerToRemove(s.name)}
                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'table_bottles' && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2 — Table Bottles Return</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bottles Returned</Label>
                <Input
                  type="number"
                  min="0"
                  value={tablBottlesReturned}
                  onChange={(e) => setTableBottlesReturned(Number(e.target.value))}
                  className="text-2xl h-14 text-center font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={tableBottlesNotes}
                  onChange={(e) => setTableBottlesNotes(e.target.value)}
                  placeholder="Any notes about table bottles..."
                  rows={2}
                />
              </div>
              <Button className="w-full h-12 bg-red-600 hover:bg-red-700" onClick={() => setStep('pod')}>
                Continue to POD
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Invoice Preview + Customer Signature */}
        {step === 'pod' && (
          <div className="space-y-4">

            {/* Invoice Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invoice for Customer</CardTitle>
                <p className="text-xs text-muted-foreground">Show this to the customer before signing</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{order.customer?.company_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Order #</span>
                  <span className="font-mono">{order.order_number}</span>
                </div>
                <Separator />
                {(order.items as any[]).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">× {item.qty} @ XCG {Number(item.unit_price).toFixed(2)}</p>
                    </div>
                    <span className="font-semibold shrink-0">XCG {Number(item.line_total).toFixed(2)}</span>
                  </div>
                ))}
                <Separator />
                {order.customer?.customer_category === 'b2c' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (6%)</span>
                    <span>XCG {(Number(order.total) * 0.06 / 1.06).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base">
                  <span>Total Due</span>
                  <span className="text-red-600">XCG {Number(order.total).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Signature */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PenLine className="h-5 w-5 text-red-600" />
                  Customer Signature
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Hand the phone to the customer to sign below
                </p>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Signer name — pick a known contact for this customer or type a new one */}
                <div className="space-y-1.5">
                  <Label>Who is signing? <span className="text-red-500">*</span></Label>
                  {knownSigners && knownSigners.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {knownSigners.slice(0, 6).map((s) => {
                        const selected = signerName.trim().toLowerCase() === s.name.toLowerCase()
                        return (
                          <span
                            key={s.name}
                            className={`inline-flex items-center rounded-full text-xs border transition-colors ${
                              selected ? 'bg-red-600 text-white border-red-600' : 'bg-background border-input'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSignerName(s.name)}
                              className={`px-2.5 py-1 rounded-full ${selected ? '' : 'hover:bg-muted'}`}
                            >
                              {s.name}
                            </button>
                            {/* Admin only — drop this person from the customer's signer list */}
                            {isAdmin && (
                              <button
                                type="button"
                                title={`Remove ${s.name}`}
                                aria-label={`Remove ${s.name}`}
                                onClick={() => setSignerToRemove(s.name)}
                                className={`pl-0.5 pr-2 ${
                                  selected ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-destructive'
                                }`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <Input
                    placeholder="Type a name or pick above"
                    list="known-signers"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                  <datalist id="known-signers">
                    {(knownSigners ?? []).map((s) => <option key={s.name} value={s.name} />)}
                  </datalist>
                </div>

                <Separator />

                {/* Signature */}
                <div className="space-y-2">
                  <Label>Signature <span className="text-red-500">*</span></Label>
                  <div className="border-2 border-dashed rounded-xl overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-52 touch-none cursor-crosshair"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => sigPadRef.current?.clear()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear signature
                  </Button>
                </div>

                <Separator />

                {/* Delivery photo */}
                <div className="space-y-1.5">
                  <Label>
                    Delivery photo{' '}
                    {order?.customer?.require_delivery_photo
                      ? <span className="text-red-500">*</span>
                      : <span className="text-muted-foreground text-xs">(optional)</span>}
                  </Label>
                  {photoPreview ? (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="POD" className="w-full rounded-lg object-cover max-h-48" />
                      <Button variant="outline" size="sm" className="mt-2 gap-1.5"
                        onClick={() => { setPhotoFile(null); setPhotoPreview('') }}>
                        <Trash2 className="h-3.5 w-3.5" /> Retake
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed rounded-xl p-6 text-muted-foreground hover:text-foreground hover:border-red-300 transition-colors">
                      <Camera className="h-8 w-8" />
                      <span className="text-sm font-medium">Take delivery photo</span>
                      <span className="text-xs">{order?.customer?.require_delivery_photo ? 'Required to complete delivery' : 'Optional — will be added to the PDF'}</span>
                      <input type="file" accept="image/*" capture="environment"
                        className="hidden" onChange={handlePhotoChange} />
                    </label>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                  <Textarea
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Any notes about this delivery..."
                    rows={2}
                  />
                </div>

                <Button
                  className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 gap-2"
                  onClick={handleCompleteDelivery}
                  disabled={uploading}
                >
                  {uploading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Generating signed invoice…</>
                  ) : (
                    <><CheckCircle className="h-5 w-5" /> Complete &amp; Save Signed Invoice</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-16 w-16 text-green-600" />
              <div>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">Delivery Complete!</p>
                <p className="text-sm text-green-600/80 mt-1">
                  {isOnline ? 'POD uploaded and order marked as invoice ready.' : 'POD saved offline. Will sync when connected.'}
                </p>
              </div>
              <Link href={isAdmin ? '/orders' : '/delivery-notes'}>
                <Button className="mt-2">Back to {isAdmin ? 'Orders' : 'Delivery Notes'}</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Remove signer confirmation — admin only */}
        {signerToRemove && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-muted-foreground" />
                  Remove {signerToRemove}?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {signerToRemove} will no longer be suggested as a signer for this customer.
                </p>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Past deliveries are <span className="font-medium">not</span> changed — they keep their
                    signature and signer name as proof of delivery.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setSignerToRemove(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    disabled={hideSigner.isPending}
                    onClick={async () => {
                      const customerId = (order as any)?.customer_id
                      if (customerId) {
                        await hideSigner.mutateAsync({ customerId, name: signerToRemove })
                        // Clear the field if the removed person was selected
                        if (signerName.trim().toLowerCase() === signerToRemove.trim().toLowerCase()) {
                          setSignerName('')
                        }
                      }
                      setSignerToRemove(null)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
