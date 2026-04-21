'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Loader2,
  MapPin,
  PenLine,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react'
import SignaturePad from 'signature_pad'
import { toast } from 'sonner'
import { useOrder } from '@/hooks/use-orders'
import { createClient } from '@/lib/supabase/client'
import { queuePodUpload, processQueue } from '@/lib/offline-queue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('start')
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

  // Signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

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
    if (step === 'pod' && podMode === 'signature' && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)',
      })
      resizeCanvas()
    }
    return () => {
      sigPadRef.current?.off()
    }
  }, [step, podMode])

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

  async function handleStartDelivery() {
    setGpsLoading(true)
    setGpsError('')
    try {
      const coords = await captureGps()
      setGps(coords)

      // Update order status
      await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId)

      // Create delivery record
      await supabase.from('deliveries').upsert({
        order_id: orderId,
        delivery_started_at: new Date().toISOString(),
        gps_location: { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy },
      }, { onConflict: 'order_id' })

      toast.success('Delivery started!')
      if (order?.customer?.track_table_bottles) {
        setStep('table_bottles')
      } else {
        setStep('pod')
      }
    } catch (err: any) {
      setGpsError(err.message ?? 'Could not get GPS location')
      toast.error('GPS error — check location permissions')
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
    // Validate POD
    if (podMode === 'signature' && (!sigPadRef.current || sigPadRef.current.isEmpty())) {
      toast.error('Please provide a signature')
      return
    }
    if (podMode === 'photo' && !photoFile) {
      toast.error('Please take a photo')
      return
    }

    setUploading(true)
    try {
      let podBlob: Blob
      const fileName = `pod/${orderId}-${Date.now()}.png`

      if (podMode === 'signature') {
        const dataUrl = sigPadRef.current!.toDataURL('image/png')
        const res = await fetch(dataUrl)
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
        gps_location: gps
          ? { lat: gps.latitude, lng: gps.longitude, accuracy: gps.accuracy }
          : null,
      }

      if (isOnline) {
        const url = await uploadToSupabase(podBlob, fileName)
        await supabase.from('deliveries').update({
          ...deliveryData,
          pod_file_url: url,
        }).eq('order_id', orderId)
        toast.success('Delivery completed!')
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
        <Link href="/orders"><Button variant="outline">Back</Button></Link>
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

              {gpsError && (
                <p className="text-sm text-destructive">{gpsError}</p>
              )}

              <Button
                className="w-full h-14 text-lg bg-red-600 hover:bg-red-700 gap-2"
                onClick={handleStartDelivery}
                disabled={gpsLoading}
              >
                {gpsLoading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Getting GPS...</>
                ) : (
                  <><MapPin className="h-5 w-5" /> Start Delivery</>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Tapping Start will capture your GPS location
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Table Bottles */}
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

        {/* Step 3: POD */}
        {step === 'pod' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {podMode === 'signature' ? <PenLine className="h-5 w-5 text-red-600" /> : <Camera className="h-5 w-5 text-red-600" />}
                Step {order?.customer?.track_table_bottles ? 3 : 2} — Proof of Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* POD Mode Toggle */}
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${podMode === 'signature' ? 'bg-red-600 text-white' : 'hover:bg-accent'}`}
                  onClick={() => setPodMode('signature')}
                >
                  <PenLine className="h-4 w-4" />
                  Signature
                </button>
                <button
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${podMode === 'photo' ? 'bg-red-600 text-white' : 'hover:bg-accent'}`}
                  onClick={() => setPodMode('photo')}
                >
                  <Camera className="h-4 w-4" />
                  Photo
                </button>
              </div>

              {podMode === 'signature' ? (
                <div className="space-y-2">
                  <Label>Customer Signature</Label>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-48 touch-none cursor-crosshair"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => sigPadRef.current?.clear()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Delivery Photo</Label>
                  {photoPreview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="POD" className="w-full rounded-lg object-cover max-h-64" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-1.5"
                        onClick={() => { setPhotoFile(null); setPhotoPreview('') }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Retake
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors gap-3 text-muted-foreground">
                      <Camera className="h-10 w-10 opacity-40" />
                      <p className="text-sm font-medium">Tap to take a photo</p>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                    </label>
                  )}
                </div>
              )}

              <Separator />

              <div className="space-y-1.5">
                <Label>Delivery Notes (optional)</Label>
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
                  <><Loader2 className="h-5 w-5 animate-spin" /> {isOnline ? 'Uploading...' : 'Saving...'}</>
                ) : (
                  <><Upload className="h-5 w-5" /> Complete Delivery</>
                )}
              </Button>
            </CardContent>
          </Card>
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
              <Link href="/orders">
                <Button className="mt-2">Back to Orders</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
